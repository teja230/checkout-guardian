"""
Nova Act browser automation worker.

This worker polls Redis for run jobs, executes checkout scenarios using
Amazon Nova Act for browser automation, captures screenshots after each step,
and publishes progress updates back through Redis pub/sub.

When USE_NOVA_ACT=false (default), the Express API handles simulation.
When USE_NOVA_ACT=true, this worker drives a real browser via Nova Act
against the test storefront at localhost:3002.
"""

import json
import os
import sys
import time
import uuid
from datetime import datetime

import psycopg2
import psycopg2.extras
import redis

# Config
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "dbname": os.getenv("DB_NAME", "checkout_guardian"),
    "user": os.getenv("DB_USER", "guardian"),
    "password": os.getenv("DB_PASSWORD", "guardian_dev"),
}
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", os.path.join(os.path.dirname(__file__), "..", "artifacts", "screenshots"))
STOREFRONT_URL = os.getenv("STOREFRONT_URL", "http://localhost:3002")
USE_NOVA_ACT = os.getenv("USE_NOVA_ACT", "false").lower() == "true"
RUN_UPDATES_CHANNEL = "run:updates"

r = redis.from_url(REDIS_URL)


def get_db():
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = True
    return conn


def publish_update(run_id, data):
    """Publish a live update via Redis pub/sub."""
    r.publish(RUN_UPDATES_CHANNEL, json.dumps({"runId": run_id, **data}))


def update_step(conn, run_id, step_index, **kwargs):
    """Update a run_step record in the database."""
    sets = []
    vals = []
    for key, val in kwargs.items():
        if key in ("console_errors", "network_errors"):
            sets.append(f"{key} = %s")
            vals.append(json.dumps(val))
        elif key in ("started_at", "finished_at") and val == "NOW()":
            sets.append(f"{key} = NOW()")
        else:
            sets.append(f"{key} = %s")
            vals.append(val)
    vals.extend([run_id, step_index])
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE run_steps SET {', '.join(sets)} WHERE run_id = %s AND step_index = %s",
            vals
        )


def update_run(conn, run_id, **kwargs):
    """Update a run record in the database."""
    sets = []
    vals = []
    for key, val in kwargs.items():
        if key in ("started_at", "finished_at") and val == "NOW()":
            sets.append(f"{key} = NOW()")
        else:
            sets.append(f"{key} = %s")
            vals.append(val)
    vals.append(run_id)
    with conn.cursor() as cur:
        cur.execute(f"UPDATE runs SET {', '.join(sets)} WHERE id = %s", vals)


def process_run(run_id):
    """Execute a checkout scenario using Nova Act against the test storefront."""
    conn = get_db()

    # Load run and scenario
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM runs WHERE id = %s", (run_id,))
        run = cur.fetchone()
        if not run:
            print(f"Run {run_id} not found")
            return

        cur.execute("SELECT * FROM scenarios WHERE id = %s", (run["scenario_id"],))
        scenario = cur.fetchone()
        if not scenario:
            print(f"Scenario {run['scenario_id']} not found")
            return

    active_bugs = run["active_bugs"] or []
    if isinstance(active_bugs, str):
        active_bugs = json.loads(active_bugs)

    steps = scenario["steps"]
    if isinstance(steps, str):
        steps = json.loads(steps)

    seeded_bugs = scenario["seeded_bugs"] or []
    if isinstance(seeded_bugs, str):
        seeded_bugs = json.loads(seeded_bugs)

    bug_param = ",".join(active_bugs)
    start_url = f"{STOREFRONT_URL}?bugs={bug_param}" if bug_param else STOREFRONT_URL

    print(f"[Run {run_id[:8]}] Starting with {len(steps)} steps, bugs: {active_bugs}")
    print(f"[Run {run_id[:8]}] Storefront URL: {start_url}")

    # Mark run as running
    update_run(conn, run_id, status="running", started_at="NOW()")
    publish_update(run_id, {"type": "run_status", "status": "running"})

    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    failed = False
    failed_step_index = -1

    try:
        from nova_act import NovaAct

        with NovaAct(starting_page=start_url) as nova:
            for step in steps:
                step_index = step["index"]
                step_name = step["name"]
                nova_prompt = step.get("nova_act_prompt", step_name)

                if failed:
                    update_step(conn, run_id, step_index, status="skipped")
                    publish_update(run_id, {
                        "type": "step_update",
                        "stepIndex": step_index,
                        "status": "skipped",
                    })
                    continue

                # Mark step running
                update_step(conn, run_id, step_index, status="running", started_at="NOW()")
                publish_update(run_id, {
                    "type": "step_update",
                    "stepIndex": step_index,
                    "status": "running",
                    "name": step_name,
                })

                print(f"  Step {step_index}: {step_name}")
                print(f"    Prompt: {nova_prompt}")

                # Execute the step with Nova Act
                result = nova.act(nova_prompt)

                # Capture screenshot
                screenshot_filename = f"{run_id}_step{step_index}.png"
                screenshot_path = os.path.join(ARTIFACTS_DIR, screenshot_filename)
                nova.page.screenshot(path=screenshot_path)
                print(f"    Screenshot: {screenshot_filename}")

                # Collect console errors from the page
                console_errors = []
                if hasattr(nova.page, "console_messages"):
                    for msg in nova.page.console_messages:
                        if hasattr(msg, "type") and msg.type in ("error", "warning"):
                            console_errors.append(f"{msg.type}: {msg.text}")

                # Collect network errors
                network_errors = []
                if hasattr(nova.page, "failed_requests"):
                    for req in nova.page.failed_requests:
                        err = {"url": req.url, "method": req.method}
                        if hasattr(req, "response") and req.response:
                            err["status"] = req.response.status
                        network_errors.append(err)

                # Check if this step should fail due to a seeded bug
                triggering_bug = None
                for bug in seeded_bugs:
                    if bug["id"] in active_bugs and bug.get("trigger_step") == step_index:
                        triggering_bug = bug
                        break

                # Determine step outcome: Nova Act failure OR seeded bug trigger
                step_failed = not result.success or triggering_bug is not None

                # Also detect failures by checking for visible error states on the page
                if not step_failed and not result.success:
                    step_failed = True

                if step_failed:
                    detail = ""
                    if triggering_bug:
                        detail = f"Failed: {triggering_bug['description']}"
                    elif not result.success:
                        detail = f"Nova Act could not complete: {step_name}"

                    update_step(
                        conn, run_id, step_index,
                        status="failed",
                        screenshot_path=screenshot_filename,
                        console_errors=console_errors,
                        network_errors=network_errors,
                        detail=detail,
                        finished_at="NOW()",
                    )
                    publish_update(run_id, {
                        "type": "step_update",
                        "stepIndex": step_index,
                        "status": "failed",
                        "name": step_name,
                        "detail": detail,
                        "consoleErrors": console_errors,
                        "networkErrors": network_errors,
                        "screenshotPath": screenshot_filename,
                    })
                    failed = True
                    failed_step_index = step_index
                    print(f"    FAILED: {detail}")
                else:
                    update_step(
                        conn, run_id, step_index,
                        status="passed",
                        screenshot_path=screenshot_filename,
                        console_errors=console_errors,
                        network_errors=network_errors,
                        finished_at="NOW()",
                    )
                    publish_update(run_id, {
                        "type": "step_update",
                        "stepIndex": step_index,
                        "status": "passed",
                        "name": step_name,
                        "screenshotPath": screenshot_filename,
                    })
                    print(f"    PASSED")

    except ImportError:
        print("ERROR: nova-act package not installed. Install with: pip install nova-act")
        update_run(conn, run_id, status="error", finished_at="NOW()")
        publish_update(run_id, {"type": "run_status", "status": "error"})
        conn.close()
        return
    except Exception as e:
        print(f"ERROR: {e}")
        update_run(conn, run_id, status="error", finished_at="NOW()")
        publish_update(run_id, {"type": "run_status", "status": "error"})
        conn.close()
        return

    # Finalize run
    if failed:
        update_run(conn, run_id, status="failed", finished_at="NOW()")
        publish_update(run_id, {"type": "run_status", "status": "failed"})

        # Generate triage via Nova 2 Lite
        triage = generate_triage(conn, run_id, scenario, active_bugs, failed_step_index)
        if triage:
            publish_update(run_id, {"type": "triage_ready", "triage": triage})
        print(f"[Run {run_id[:8]}] FAILED at step {failed_step_index}")
    else:
        update_run(conn, run_id, status="passed", finished_at="NOW()")
        publish_update(run_id, {"type": "run_status", "status": "passed"})
        print(f"[Run {run_id[:8]}] PASSED all steps")

    conn.close()


def generate_triage(conn, run_id, scenario, active_bugs, failed_step_index):
    """Call Nova 2 Lite via Bedrock to generate a failure triage report."""
    try:
        import boto3

        # Load step data
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM run_steps WHERE run_id = %s ORDER BY step_index",
                (run_id,)
            )
            steps = cur.fetchall()

        failed_step = next((s for s in steps if s["step_index"] == failed_step_index), None)
        seeded_bugs = scenario.get("seeded_bugs") or []
        if isinstance(seeded_bugs, str):
            seeded_bugs = json.loads(seeded_bugs)

        active_bug_details = [b for b in seeded_bugs if b["id"] in active_bugs]

        step_trace = "\n".join(
            f"Step {s['step_index']}: \"{s['name']}\" -> {s['status']}"
            + (f" ({s['detail']})" if s.get("detail") else "")
            for s in steps
        )

        console_errors = failed_step.get("console_errors") or []
        if isinstance(console_errors, str):
            console_errors = json.loads(console_errors)
        network_errors = failed_step.get("network_errors") or []
        if isinstance(network_errors, str):
            network_errors = json.loads(network_errors)

        prompt = f"""Analyze this failed checkout scenario run:

## Scenario
- Name: {scenario['name']}
- Description: {scenario['description']}

## Step Trace
{step_trace}

## Failing Step Details
- Step Index: {failed_step['step_index']}
- Step Name: {failed_step['name']}
- Detail: {failed_step.get('detail') or 'none'}
- Console Errors: {json.dumps(console_errors)}
- Network Errors: {json.dumps(network_errors)}

## Active Seeded Bug(s)
{chr(10).join(f"- ID: {b['id']}, Name: {b['name']}, Description: {b['description']}, Failure Type: {b.get('failure_type', 'unknown')}" for b in active_bug_details) if active_bug_details else 'None'}

Return your triage as valid JSON with keys: failure_category, root_cause, confidence, repro_steps, suggested_fix, jira_title, jira_description, severity"""

        bedrock = boto3.client("bedrock-runtime", region_name=os.getenv("AWS_REGION", "us-east-1"))
        model_id = os.getenv("NOVA_MODEL_ID", "us.amazon.nova-2-lite-v1:0")

        print(f"[Triage] Calling Nova 2 Lite ({model_id})...")
        response = bedrock.converse(
            modelId=model_id,
            system=[{"text": "You are a checkout failure triage agent. Return ONLY valid JSON."}],
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 1500, "temperature": 0.2},
        )

        output_text = response["output"]["message"]["content"][0]["text"]
        # Strip markdown code fences if present
        cleaned = output_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]

        triage = json.loads(cleaned.strip())
        print(f"[Triage] Success: {triage.get('failure_category')} (confidence: {triage.get('confidence')})")

    except Exception as e:
        print(f"[Triage] Nova 2 Lite failed: {e}, using fallback")
        triggering_bug = next(
            (b for b in seeded_bugs if b["id"] in active_bugs and b.get("trigger_step") == failed_step_index),
            None
        )
        triage = {
            "failure_category": triggering_bug["failure_type"] if triggering_bug else "unknown_failure",
            "root_cause": f"Seeded bug \"{triggering_bug['name']}\" triggered at step {failed_step_index}: {triggering_bug['description']}" if triggering_bug else "Step failed unexpectedly",
            "confidence": 0.85 if triggering_bug else 0.5,
            "repro_steps": [f"Step {s['step_index']}: {s['name']}" for s in steps[:failed_step_index + 1]],
            "suggested_fix": f"Investigate: {triggering_bug['description']}" if triggering_bug else "Review console and network errors",
            "jira_title": f"[Checkout] {triggering_bug['name']}" if triggering_bug else f"Checkout failure at step {failed_step_index}",
            "jira_description": f"**Summary:** {scenario['name']} failed at step {failed_step_index}.\n\n**Root Cause:** {triggering_bug['description'] if triggering_bug else 'Unknown'}",
            "severity": "critical" if triggering_bug and ("payment" in triggering_bug.get("failure_type", "") or "validation" in triggering_bug.get("failure_type", "")) else "high",
        }

    # Persist triage
    repro_steps = triage.get("repro_steps", [])
    if not isinstance(repro_steps, list):
        repro_steps = [repro_steps]

    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO triage_reports
               (run_id, failure_category, root_cause, confidence, repro_steps,
                suggested_fix, jira_title, jira_description, severity, raw_response)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                run_id,
                triage.get("failure_category"),
                triage.get("root_cause"),
                float(triage.get("confidence", 0.5)),
                json.dumps(repro_steps),
                triage.get("suggested_fix"),
                triage.get("jira_title"),
                triage.get("jira_description"),
                triage.get("severity"),
                json.dumps(triage),
            )
        )

    return triage


def poll_for_jobs():
    """Poll Redis for new run jobs and process them."""
    print("Polling for run jobs on queue:runs...")
    while True:
        # Block-wait for a job on the Redis list
        result = r.brpop("queue:runs", timeout=5)
        if result:
            _, job_data = result
            job = json.loads(job_data)
            run_id = job.get("runId")
            if run_id:
                print(f"\nReceived job: run {run_id[:8]}")
                process_run(run_id)
        # If no job, loop continues (heartbeat)


if __name__ == "__main__":
    print("=" * 50)
    print("Checkout Guardian — Nova Act Worker")
    print("=" * 50)
    print(f"  Mode:       {'LIVE (Nova Act)' if USE_NOVA_ACT else 'SIMULATED (Express API handles runs)'}")
    print(f"  Storefront: {STOREFRONT_URL}")
    print(f"  Database:   {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}")
    print(f"  Redis:      {REDIS_URL}")
    print(f"  Artifacts:  {ARTIFACTS_DIR}")
    print()

    if not USE_NOVA_ACT:
        print("Nova Act is disabled. The Express API handles run execution in simulated mode.")
        print("To enable live browser automation:")
        print("  export USE_NOVA_ACT=true")
        print("  python nova_act_runner.py")
        sys.exit(0)

    # Verify nova-act is importable
    try:
        import nova_act
        print(f"  Nova Act SDK: {nova_act.__version__ if hasattr(nova_act, '__version__') else 'installed'}")
    except ImportError:
        print("ERROR: nova-act package not found. Install with:")
        print("  pip install nova-act")
        sys.exit(1)

    print()
    poll_for_jobs()
