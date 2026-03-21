#!/usr/bin/env python3
"""
AcmeClaw Lawn Care Agent — POC
Strands Agents SDK + Mercury 2 (via OpenAI-compatible API)

Tools: quoting, scheduling, weather, customer comms, invoicing, seasonal upsells
"""

from strands import Agent, tool
from strands.models.openai import OpenAIModel
import json
from datetime import datetime, timedelta

# ═══════════════════════════════════════
# BUSINESS CONFIG (would come from DynamoDB in production)
# ═══════════════════════════════════════

BUSINESS = {
    "name": "Green Valley Lawn Care",
    "owner": "Chad Hendren",
    "phone": "(402) 555-0147",
    "email": "chad.hendren@gmail.com",
    "service_area": "Omaha, NE — 30 mile radius",
    "crew_size": 3,
    "pricing": {
        "base_mow": {"small": 35, "medium": 45, "large": 65, "xl": 85},
        "edging": 15,
        "trimming": 20,
        "leaf_removal": {"small": 75, "medium": 125, "large": 200},
        "aeration": {"small": 60, "medium": 90, "large": 140},
        "overseeding": {"small": 80, "medium": 120, "large": 180},
        "fertilization": {"small": 45, "medium": 65, "large": 95},
        "spring_cleanup": {"small": 100, "medium": 175, "large": 250},
        "fall_cleanup": {"small": 125, "medium": 200, "large": 300},
        "snow_removal": {"per_push": 50, "seasonal": 450},
    },
    "lot_sizes": {
        "small": "Under 5,000 sq ft",
        "medium": "5,000 - 10,000 sq ft",
        "large": "10,000 - 20,000 sq ft",
        "xl": "Over 20,000 sq ft",
    },
    "schedule": {
        "mon": ["8am-5pm"],
        "tue": ["8am-5pm"],
        "wed": ["8am-5pm"],
        "thu": ["8am-5pm"],
        "fri": ["8am-5pm"],
        "sat": ["8am-12pm"],
        "sun": "closed",
    },
}

# Simulated customer database
CUSTOMERS = {
    "C001": {"name": "Sarah Johnson", "address": "1234 Maple St, Omaha NE", "lot_size": "medium", "email": "sarah@example.com", "phone": "402-555-0101", "services": ["weekly_mow"], "balance": 0},
    "C002": {"name": "Mike Peters", "address": "5678 Oak Ave, Omaha NE", "lot_size": "large", "email": "mike@example.com", "phone": "402-555-0202", "services": ["weekly_mow", "fertilization"], "balance": 45},
    "C003": {"name": "Lisa Chen", "address": "910 Pine Dr, Omaha NE", "lot_size": "small", "email": "lisa@example.com", "phone": "402-555-0303", "services": [], "balance": 0},
}

# Simulated schedule
SCHEDULE = {}


# ═══════════════════════════════════════
# TOOLS
# ═══════════════════════════════════════

@tool
def generate_quote(lot_size: str, services: str) -> str:
    """Generate a price quote for lawn care services based on lot size.

    Args:
        lot_size: The lot size category: small, medium, large, or xl.
        services: Comma-separated list of requested services (e.g., 'mow,edging,trimming').
    """
    lot = lot_size.lower().strip()
    if lot not in BUSINESS["pricing"]["base_mow"]:
        return f"Invalid lot size '{lot}'. Options: small, medium, large, xl."

    requested = [s.strip().lower() for s in services.split(",")]
    total = 0
    breakdown = []

    for svc in requested:
        if svc in ("mow", "mowing", "base_mow", "weekly_mow"):
            price = BUSINESS["pricing"]["base_mow"][lot]
            breakdown.append(f"Mowing ({BUSINESS['lot_sizes'][lot]}): ${price}")
            total += price
        elif svc in ("edge", "edging"):
            price = BUSINESS["pricing"]["edging"]
            breakdown.append(f"Edging: ${price}")
            total += price
        elif svc in ("trim", "trimming"):
            price = BUSINESS["pricing"]["trimming"]
            breakdown.append(f"Trimming: ${price}")
            total += price
        elif svc in ("aeration", "aerate"):
            price = BUSINESS["pricing"]["aeration"].get(lot, 90)
            breakdown.append(f"Aeration: ${price}")
            total += price
        elif svc in ("overseeding", "overseed"):
            price = BUSINESS["pricing"]["overseeding"].get(lot, 120)
            breakdown.append(f"Overseeding: ${price}")
            total += price
        elif svc in ("fertilization", "fertilize", "fert"):
            price = BUSINESS["pricing"]["fertilization"].get(lot, 65)
            breakdown.append(f"Fertilization: ${price}")
            total += price
        elif svc in ("leaf_removal", "leaves", "leaf"):
            price = BUSINESS["pricing"]["leaf_removal"].get(lot, 125)
            breakdown.append(f"Leaf Removal: ${price}")
            total += price
        elif svc in ("spring_cleanup", "spring"):
            price = BUSINESS["pricing"]["spring_cleanup"].get(lot, 175)
            breakdown.append(f"Spring Cleanup: ${price}")
            total += price
        elif svc in ("fall_cleanup", "fall"):
            price = BUSINESS["pricing"]["fall_cleanup"].get(lot, 200)
            breakdown.append(f"Fall Cleanup: ${price}")
            total += price
        elif svc in ("snow", "snow_removal"):
            price = BUSINESS["pricing"]["snow_removal"]["per_push"]
            breakdown.append(f"Snow Removal (per push): ${price}")
            total += price

    quote = f"QUOTE — {BUSINESS['name']}\n"
    quote += f"Lot Size: {BUSINESS['lot_sizes'][lot]}\n\n"
    for line in breakdown:
        quote += f"  {line}\n"
    quote += f"\n  TOTAL: ${total}\n"
    quote += f"\nValid for 30 days. Call {BUSINESS['phone']} to schedule."
    return quote


@tool
def check_schedule(date: str) -> str:
    """Check available appointment slots for a given date.

    Args:
        date: The date to check in YYYY-MM-DD format.
    """
    try:
        d = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        return "Invalid date format. Use YYYY-MM-DD."

    day = d.strftime("%a").lower()[:3]
    hours = BUSINESS["schedule"].get(day, "closed")
    if hours == "closed":
        return f"{d.strftime('%A, %B %d')}: CLOSED. We operate Mon-Fri 8am-5pm, Sat 8am-12pm."

    booked = SCHEDULE.get(date, [])
    slots = ["8:00 AM", "9:30 AM", "11:00 AM", "1:00 PM", "2:30 PM", "4:00 PM"]
    if day == "sat":
        slots = ["8:00 AM", "9:30 AM", "11:00 AM"]

    available = [s for s in slots if s not in booked]
    if not available:
        return f"{d.strftime('%A, %B %d')}: FULLY BOOKED. Try another date."

    return f"{d.strftime('%A, %B %d')} — Available slots:\n" + "\n".join(f"  • {s}" for s in available)


@tool
def book_appointment(customer_name: str, date: str, time: str, services: str) -> str:
    """Book a lawn care appointment for a customer.

    Args:
        customer_name: The customer's name.
        date: Appointment date in YYYY-MM-DD format.
        time: Appointment time (e.g., '9:30 AM').
        services: Services to perform (e.g., 'mow, edging').
    """
    if date not in SCHEDULE:
        SCHEDULE[date] = []
    SCHEDULE[date].append(time)

    confirmation = f"APPOINTMENT CONFIRMED\n"
    confirmation += f"Customer: {customer_name}\n"
    confirmation += f"Date: {date} at {time}\n"
    confirmation += f"Services: {services}\n"
    confirmation += f"Crew will arrive within 30 minutes of scheduled time.\n"
    confirmation += f"Confirmation sent to customer."
    return confirmation


@tool
def check_weather(date: str) -> str:
    """Check weather forecast for a service date to determine if work can proceed.

    Args:
        date: The date to check weather for in YYYY-MM-DD format.
    """
    # Simulated weather
    import random
    random.seed(hash(date))
    conditions = random.choice([
        ("Sunny, 75°F", True),
        ("Partly Cloudy, 68°F", True),
        ("Overcast, 62°F", True),
        ("Light Rain, 58°F", False),
        ("Thunderstorms, 72°F", False),
        ("Sunny, 82°F", True),
    ])
    weather, can_work = conditions
    status = "GO — Safe to mow" if can_work else "DELAY — Wet conditions, reschedule recommended"
    return f"Weather for {date}: {weather}\nStatus: {status}"


@tool
def lookup_customer(search: str) -> str:
    """Look up a customer by name, phone, or address.

    Args:
        search: Name, phone number, or address to search for.
    """
    search_lower = search.lower()
    matches = []
    for cid, c in CUSTOMERS.items():
        if search_lower in c["name"].lower() or search_lower in c.get("phone", "") or search_lower in c["address"].lower():
            matches.append(f"[{cid}] {c['name']} — {c['address']}\n  Phone: {c['phone']} | Lot: {c['lot_size']} | Balance: ${c['balance']}\n  Services: {', '.join(c['services']) or 'none'}")

    if not matches:
        return f"No customer found matching '{search}'."
    return "Customer Records:\n" + "\n".join(matches)


@tool
def generate_invoice(customer_name: str, services: str, amount: str) -> str:
    """Generate an invoice for completed lawn care services.

    Args:
        customer_name: The customer's name.
        services: Description of services performed.
        amount: Total amount in dollars.
    """
    invoice_num = f"INV-{datetime.now().strftime('%Y%m%d%H%M')}"
    due_date = (datetime.now() + timedelta(days=30)).strftime("%B %d, %Y")

    invoice = f"{'='*40}\n"
    invoice += f"INVOICE #{invoice_num}\n"
    invoice += f"{BUSINESS['name']}\n"
    invoice += f"{'='*40}\n\n"
    invoice += f"Bill To: {customer_name}\n"
    invoice += f"Date: {datetime.now().strftime('%B %d, %Y')}\n"
    invoice += f"Due: {due_date}\n\n"
    invoice += f"Services: {services}\n"
    invoice += f"Amount: ${amount}\n\n"
    invoice += f"Payment: Venmo @greenvalleylawn or check\n"
    invoice += f"Questions? {BUSINESS['phone']}\n"
    invoice += f"{'='*40}"
    return invoice


@tool
def seasonal_recommendation(month: str) -> str:
    """Get seasonal service recommendations for upselling based on the current month.

    Args:
        month: Current month (e.g., 'march', 'july', 'october').
    """
    recommendations = {
        "march": "SPRING PREP: Spring cleanup + first fertilization. Bundle saves 15%.",
        "april": "SPRING: Aeration + overseeding is ideal now. Soil temp is perfect.",
        "may": "PEAK SEASON: Weekly mowing starts. Offer seasonal contracts — 10% discount for prepay.",
        "june": "SUMMER: Raise mow height for heat stress. Offer fertilization round 2.",
        "july": "SUMMER: Drought watch — recommend irrigation checks. Trimming + edging upsell.",
        "august": "LATE SUMMER: Aeration window opens. Book fall services now.",
        "september": "FALL PREP: Overseeding + aeration combo. Best time for lawn recovery.",
        "october": "FALL: Leaf removal packages. Last fertilization of the year.",
        "november": "LATE FALL: Final cleanup + winterization. Pitch snow removal contracts.",
        "december": "WINTER: Snow removal. Send renewal reminders for spring contracts.",
        "january": "OFF-SEASON: Equipment maintenance. Send early-bird spring booking discounts.",
        "february": "PRE-SEASON: Spring cleanup scheduling opens. Early bird gets 10% off.",
    }
    month_lower = month.lower().strip()
    return recommendations.get(month_lower, f"No specific recommendations for '{month}'. Check pricing with generate_quote.")


@tool
def send_customer_message(customer_name: str, message_type: str, content: str) -> str:
    """Send a message to a customer (appointment reminder, invoice, promotion, etc.).

    Args:
        customer_name: The customer's name.
        message_type: Type: reminder, invoice, promotion, followup, rain_delay.
        content: The message content to send.
    """
    return f"MESSAGE SENT to {customer_name}\nType: {message_type}\nContent: {content}\n\nDelivered via email and SMS."


# ═══════════════════════════════════════
# AGENT
# ═══════════════════════════════════════

SYSTEM_PROMPT = f"""You are the AI assistant for {BUSINESS['name']}, a lawn care company in {BUSINESS['service_area']}.

Owner: {BUSINESS['owner']}
Phone: {BUSINESS['phone']}
Email: {BUSINESS['email']}
Crew Size: {BUSINESS['crew_size']}
Hours: Mon-Fri 8am-5pm, Sat 8am-12pm, Sun closed

You help with:
- Generating quotes for lawn care services
- Scheduling and booking appointments
- Checking weather for service days
- Looking up customer information
- Generating invoices
- Seasonal upsell recommendations
- Customer communications (reminders, follow-ups, promotions)

Always use your tools. Be friendly, professional, and proactive about upselling seasonal services.
When a customer asks for a quote, always ask about lot size if not provided.
After booking, always check the weather for that date.

Copyright 2026 Chad Hendren. All Rights Reserved. AcmeClaw — Tool Up. Build On."""


def create_lawn_care_agent():
    model = OpenAIModel(
        client_args={
            "api_key": "sk_79026cd211206efaf6e90cde234f4ee5",
            "base_url": "https://api.inceptionlabs.ai/v1",
        },
        model_id="mercury-2",
        params={"max_tokens": 1000},
    )

    return Agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
        tools=[
            generate_quote,
            check_schedule,
            book_appointment,
            check_weather,
            lookup_customer,
            generate_invoice,
            seasonal_recommendation,
            send_customer_message,
        ],
    )


if __name__ == "__main__":
    import sys
    import time

    agent = create_lawn_care_agent()

    if len(sys.argv) > 1:
        prompt = " ".join(sys.argv[1:])
        t0 = time.time()
        response = agent(prompt)
        print(f"\n--- {time.time()-t0:.1f}s ---")
    else:
        print(f"\n{'='*50}")
        print(f"  {BUSINESS['name']} — AI Assistant")
        print(f"  Powered by AcmeClaw + Mercury 2")
        print(f"{'='*50}")
        print(f"Type 'quit' to exit\n")
        while True:
            try:
                prompt = input("Customer: ").strip()
                if prompt.lower() in ("quit", "exit", "q"):
                    break
                if not prompt:
                    continue
                t0 = time.time()
                response = agent(prompt)
                print(f"\n--- {time.time()-t0:.1f}s ---\n")
            except (KeyboardInterrupt, EOFError):
                break
