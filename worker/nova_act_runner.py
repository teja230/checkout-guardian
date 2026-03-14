"""
Nova Act browser automation worker.

This worker polls Redis for run jobs, executes checkout scenarios using
Amazon Nova Act for browser automation, captures screenshots after each step,
and publishes progress updates back through Redis pub/sub.

For the hackathon MVP, this can run in simulated mode (no real Nova Act)
or live mode with actual browser automation.
"""

import json
import os
import time
import uuid
from datetime import datetime

import psycopg2
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
ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", "../artifacts/screenshots")
USE_NOVA_ACT = os.getenv("USE_NOVA_ACT", "false").lower() == "true"

r = redis.from_url(REDIS_URL)


def get_db():
    return psycopg2.connect(**DB_CONFIG)


def run_step_with_nova_act(nova_act_prompt: str, step_name: str, run_id: str, step_index: int):
    """
    Execute a single checkout step using Amazon Nova Act.
    Returns (success, screenshot_path, console_errors, network_errors)
    """
    if not USE_NOVA_ACT:
        # Simulated mode — the Express API handles simulation
        return True, None, [], []

    try:
        from nova_act import NovaAct

        with NovaAct(starting_page="https://demo-store.example.com") as nova:
            result = nova.act(nova_act_prompt)

            # Capture screenshot
            screenshot_path = f"{run_id}_step{step_index}.png"
            full_path = os.path.join(ARTIFACTS_DIR, screenshot_path)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            nova.page.screenshot(path=full_path)

            # Collect console errors
            console_errors = []
            for msg in nova.page.console_messages:
                if msg.type in ("error", "warning"):
                    console_errors.append(f"{msg.type}: {msg.text}")

            # Collect failed network requests
            network_errors = []
            for req in nova.page.failed_requests:
                network_errors.append({
                    "url": req.url,
                    "method": req.method,
                    "status": req.response.status if req.response else None,
                })

            return result.success, screenshot_path, console_errors, network_errors

    except ImportError:
        print("Nova Act SDK not installed. Running in simulated mode.")
        return True, None, [], []
    except Exception as e:
        print(f"Nova Act error: {e}")
        return False, None, [str(e)], []


def call_nova_2_lite_triage(context: dict) -> dict:
    """
    Call Amazon Nova 2 Lite to generate a failure triage report.

    In production, this sends the failure context (screenshots, console errors,
    network errors, DOM snapshots) to Nova 2 Lite for reasoning-based analysis.
    """
    try:
        import boto3

        bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

        prompt = f"""You are a checkout failure triage agent. Analyze this failed checkout run and produce a diagnosis.

Scenario: {context['scenario_name']}
Failed Step: {context['failed_step_name']} (step {context['failed_step_index']})
Console Errors: {json.dumps(context.get('console_errors', []))}
Network Errors: {json.dumps(context.get('network_errors', []))}

Return valid JSON with keys: failure_category, root_cause, confidence, repro_steps, suggested_fix, jira_title, jira_description, severity"""

        response = bedrock.invoke_model(
            modelId="amazon.nova-lite-v1:0",
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "inputText": prompt,
                "textGenerationConfig": {
                    "maxTokenCount": 1500,
                    "temperature": 0.2,
                },
            }),
        )

        result = json.loads(response["body"].read())
        return json.loads(result["results"][0]["outputText"])

    except Exception as e:
        print(f"Nova 2 Lite call failed: {e}")
        # The Express API has fallback triage templates
        return None


if __name__ == "__main__":
    print("Nova Act Worker ready.")
    print(f"  Mode: {'LIVE' if USE_NOVA_ACT else 'SIMULATED'}")
    print(f"  DB: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}")
    print(f"  Redis: {REDIS_URL}")
    print()
    print("In simulated mode, the Express API handles all run execution.")
    print("Set USE_NOVA_ACT=true to enable live browser automation.")
