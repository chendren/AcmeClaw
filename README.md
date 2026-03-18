<p align="center">
  <img src="mascot-avatar.png" alt="AcmeClaw — Tool Up. Build On." width="800">
</p>

<p align="center">
  <a href="https://acmeclaw.ai"><img src="https://img.shields.io/badge/🦞_AcmeClaw.ai-Visit_Website-dc3c32?style=for-the-badge&labelColor=0a0e17" alt="Visit AcmeClaw.ai"></a>
</p>

<h1 align="center">AcmeClaw</h1>
<h3 align="center">Tool Up. Build On.</h3>

<p align="center">
  <a href="https://acmeclaw.ai">Website</a> &bull;
  <a href="https://www.linkedin.com/in/chad-david-hendren/">LinkedIn</a> &bull;
  <a href="https://huggingface.co/chendren">Hugging Face</a> &bull;
  <a href="https://github.com/chendren/AcmeClaw">GitHub</a>
</p>

---

## What is AcmeClaw?

AcmeClaw is a managed AI agent platform built on [OpenClaw](https://github.com/openclaw/openclaw), the open-source AI agent framework with 200K+ GitHub stars. We deliver managed OpenClaw instances, AI agent development, professional services, and custom applications — built with the Working Backwards methodology from the book **Ship the Press Release**.

### Services

| Service | Description |
|---------|-------------|
| **Managed OpenClaw** | Fully managed, sandboxed OpenClaw deployments with vetted skill registry and enterprise ops |
| **AI Agent Development** | Custom autonomous agents built with specification coding and test-first architecture |
| **Professional Services** | Strategic consulting for AI adoption, CX, and contact center transformation |
| **Project Management** | End-to-end leadership from PR/FAQ through deployment |
| **AI Adoption Simulations** | Business simulation exercises for adoption decisions before committing resources |
| **Custom App Development** | Full-stack builds using the Working Backwards methodology |

---

## AcmeClaw Theme for OpenClaw

This repo includes a **branding overlay** that transforms any OpenClaw installation into AcmeClaw — custom colors, mascot favicon, branded UI, and copyright notices.

### Quick Start

```bash
# Apply AcmeClaw theme to your OpenClaw installation
cd acmeclaw-theme
./scripts/apply-theme.sh

# Revert to original OpenClaw branding
./scripts/revert-theme.sh
```

### What the Theme Changes

| Component | OpenClaw Default | AcmeClaw Theme |
|-----------|-----------------|----------------|
| **Favicon** | Red lobster SVG | AcmeClaw robot mascot |
| **Page title** | "OpenClaw Control" | "AcmeClaw Control" |
| **Primary color** | `#ff5c5c` | `#dc3c32` |
| **Accent color** | `#14b8a6` teal | `#00d4ff` cyan |
| **Scrollbar** | Default | AcmeClaw red |
| **Selection** | Default | AcmeClaw red dim |
| **Footer** | None | Copyright + "Tool Up. Build On." |
| **Export template** | "OpenClaw" | "AcmeClaw" |

### Theme Structure

```
acmeclaw-theme/
├── assets/
│   └── favicon.svg          # AcmeClaw robot mascot favicon
├── css/
│   └── acmeclaw-theme.css   # CSS override layer (injected into control-ui)
├── scripts/
│   ├── apply-theme.sh       # Apply AcmeClaw branding to OpenClaw
│   └── revert-theme.sh      # Revert to original OpenClaw branding
└── LICENSE                  # Copyright 2026 Chad Hendren. All Rights Reserved.
```

### Deployment Architecture

AcmeClaw runs on **Amazon Bedrock AgentCore** for team deployments:

| Component | Technology | Cost |
|-----------|-----------|------|
| Agent Runtime | Bedrock AgentCore microVMs | ~$2/user/month |
| LLM Backend | Amazon Nova Lite v1 | ~$0.20/month (10 tasks/day) |
| Agent Memory | AgentCore Memory | ~$0.45/month |
| Pre-order API | API Gateway + Lambda + DynamoDB | ~$0.00 (free tier) |
| Website | S3 + CloudFront | ~$0.02/month |

For solo/micro-SMB: **Amazon Lightsail OpenClaw blueprint** at $20/month flat.

---

## The Book

**Ship the Press Release** — *How the AcmeClaw PR/FAQ Was Written, Every Test Defined, and Zero Code Existed — Then the Agent Built It*

A practitioner's guide to Working Backwards, Specification Coding, and the art of not fighting your AI. The companion repository is at [acmeclaw.ai/workingbackwards/repo/](https://acmeclaw.ai/workingbackwards/repo/).

---

## About

Built by **Chad Hendren** — Inventor, Author, 30+ years in CX & Telco, 33 patents.

Copyright 2026 Chad Hendren. All Rights Reserved.

---

<p align="center"><em>Ship the Press Release. Then build everything else.</em></p>
