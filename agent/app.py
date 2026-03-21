#!/usr/bin/env python3
"""
AcmeClaw AgentCore Runtime Application
Wraps the Strands agent for deployment to Amazon Bedrock AgentCore Runtime.

Copyright 2026 Chad Hendren. All Rights Reserved.
"""

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from acmeclaw_agent import create_agent

app = BedrockAgentCoreApp()


@app.entrypoint
async def invoke(payload: dict, context) -> dict:
    """Handle an incoming agent invocation."""
    prompt = payload.get("prompt", payload.get("input", payload.get("text", "")))

    if not prompt:
        return {"error": "No prompt provided", "status": "error"}

    try:
        agent = create_agent()
        response = agent(prompt)
        return {
            "result": str(response),
            "status": "success",
            "model": "us.amazon.nova-lite-v1:0",
            "agent": "AcmeClaw-SMB",
        }
    except Exception as e:
        return {
            "error": str(e),
            "status": "error",
        }


if __name__ == "__main__":
    app.run()
