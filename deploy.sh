#!/bin/bash
# AcmeClaw.ai — S3 Static Site Deployment
# Usage: ./deploy.sh [bucket-name]
#
# Prerequisites:
#   1. AWS CLI configured with appropriate credentials
#   2. S3 bucket created with static website hosting enabled
#   3. Route53 domain pointing to the bucket/CloudFront distribution

set -euo pipefail

BUCKET="${1:-acmeclaw.ai}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

echo "Deploying AcmeClaw.ai to s3://${BUCKET}..."

# Sync HTML files with short cache
aws s3 sync . "s3://${BUCKET}" \
  --exclude "*.sh" \
  --exclude ".DS_Store" \
  --exclude "*.md" \
  --cache-control "max-age=300,s-maxage=86400" \
  --content-type "text/html" \
  --region "${REGION}"

# If CloudFront distribution exists, invalidate cache
DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items[?contains(@, '${BUCKET}')]].Id" \
  --output text 2>/dev/null || true)

if [ -n "${DIST_ID}" ] && [ "${DIST_ID}" != "None" ]; then
  echo "Invalidating CloudFront distribution ${DIST_ID}..."
  aws cloudfront create-invalidation \
    --distribution-id "${DIST_ID}" \
    --paths "/*" \
    --region "${REGION}"
fi

echo "Deployed successfully to https://${BUCKET}"
