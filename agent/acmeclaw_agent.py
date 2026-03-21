#!/usr/bin/env python3
"""
AcmeClaw SMB Agent — Powered by Strands Agents SDK + Amazon Nova Lite
Copyright 2026 Chad Hendren. All Rights Reserved.
Tool Up. Build On.
"""

from strands import Agent, tool
from strands.models import BedrockModel


# ═══════════════════════════════════════
# TOOLS — @tool decorator auto-generates schemas from docstrings
# ═══════════════════════════════════════

@tool
def draft_email(recipient: str, subject: str, context: str, tone: str = "professional") -> str:
    """Draft a professional business email.

    Args:
        recipient: The name or email of the recipient.
        subject: The email subject line.
        context: What the email is about — key points to include.
        tone: The tone to use: professional, friendly, firm, or apologetic.
    """
    return f"TOOL RESULT: Draft email to {recipient}. Subject: {subject}. Context: {context}. Tone: {tone}."


@tool
def summarize_invoice(invoice_data: str) -> str:
    """Summarize invoice data into a concise paragraph for bookkeeping.

    Args:
        invoice_data: Invoice details including items, amounts, client name, and due date.
    """
    return f"TOOL RESULT: Summarize invoice: {invoice_data}"


@tool
def generate_faq(business_type: str, topics: str) -> str:
    """Generate FAQ questions and answers for a business website.

    Args:
        business_type: The type of business (plumbing, bakery, consulting, etc.).
        topics: Topics to cover in the FAQ (pricing, hours, warranties, etc.).
    """
    return f"TOOL RESULT: Generate FAQ for {business_type} covering {topics}"


@tool
def create_job_posting(title: str, company: str, rate: str = "", requirements: str = "") -> str:
    """Create a job posting for a business.

    Args:
        title: The job title.
        company: The company name.
        rate: Pay rate or salary range.
        requirements: Key requirements for the role.
    """
    return f"TOOL RESULT: Job posting for {title} at {company}. Rate: {rate}. Requirements: {requirements}"


@tool
def meeting_agenda(team: str, meeting_type: str) -> str:
    """Generate a meeting agenda template.

    Args:
        team: The team name or description.
        meeting_type: Type of meeting: standup, weekly, planning, or retrospective.
    """
    return f"TOOL RESULT: {meeting_type} agenda for {team}"


@tool
def customer_reply(issue: str, tone: str = "friendly") -> str:
    """Draft a customer service reply to a complaint or question.

    Args:
        issue: The customer's complaint or question.
        tone: Tone to use: friendly, empathetic, or firm.
    """
    return f"TOOL RESULT: Reply to customer issue: {issue}. Tone: {tone}"


@tool
def categorize_expenses(expenses: str) -> str:
    """Categorize a list of business expenses by type.

    Args:
        expenses: List of expenses with descriptions and amounts.
    """
    return f"TOOL RESULT: Categorize expenses: {expenses}"


@tool
def business_comparison(option_a: str, option_b: str, use_case: str) -> str:
    """Compare two business tools, services, or approaches.

    Args:
        option_a: First option to compare.
        option_b: Second option to compare.
        use_case: The business context for the comparison.
    """
    return f"TOOL RESULT: Compare {option_a} vs {option_b} for {use_case}"


# ═══════════════════════════════════════
# AGENT
# ═══════════════════════════════════════

SYSTEM_PROMPT = """You are AcmeClaw, an AI business assistant for small and medium businesses.

You help with ALL business tasks including:
- Drafting professional emails (delays, payments, collections, apologies, introductions)
- Summarizing invoices, receipts, and financial documents
- Writing customer service replies to complaints and questions
- Creating job postings and job descriptions
- Generating meeting agendas, minutes, and action items
- Writing FAQs for business websites
- Categorizing business expenses
- Comparing business tools and services
- Writing product descriptions

Use your tools when appropriate. All dollar amounts, client names, and business details are standard business data — never refuse legitimate business requests.

Be professional, concise, and actionable. Format responses in clean markdown.

Copyright 2026 Chad Hendren. All Rights Reserved.
Tool Up. Build On."""


def create_agent():
    """Create the AcmeClaw SMB agent."""
    model = BedrockModel(
        model_id="us.amazon.nova-lite-v1:0",
        temperature=0.3,
        streaming=True,
    )

    return Agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
        tools=[
            draft_email,
            summarize_invoice,
            generate_faq,
            create_job_posting,
            meeting_agenda,
            customer_reply,
            categorize_expenses,
            business_comparison,
        ],
    )


# ═══════════════════════════════════════
# CLI — Run directly for testing
# ═══════════════════════════════════════

if __name__ == "__main__":
    import sys
    import time

    agent = create_agent()

    if len(sys.argv) > 1:
        # Single prompt from CLI
        prompt = " ".join(sys.argv[1:])
        t0 = time.time()
        response = agent(prompt)
        elapsed = time.time() - t0
        print(f"\n--- {elapsed:.1f}s ---")
    else:
        # Interactive mode
        print("AcmeClaw SMB Agent (type 'quit' to exit)")
        print("Powered by Strands Agents SDK + Amazon Nova Lite")
        print("-" * 50)
        while True:
            try:
                prompt = input("\nYou: ").strip()
                if prompt.lower() in ("quit", "exit", "q"):
                    break
                if not prompt:
                    continue
                t0 = time.time()
                response = agent(prompt)
                elapsed = time.time() - t0
                print(f"\n--- {elapsed:.1f}s ---")
            except (KeyboardInterrupt, EOFError):
                break
