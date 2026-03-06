#!/bin/bash
set -e

# GitHub Repo Creator Lambda — Docker-based deploy script
# Only requirement: Docker + AWS credentials on your machine

echo "=== GitHub Repo Creator Lambda — Deploy ==="
echo ""

# Ask for AWS profile
read -p "AWS profile to use [default]: " AWS_PROFILE
AWS_PROFILE=${AWS_PROFILE:-default}

# Ask for region
read -p "AWS region [us-east-1]: " AWS_REGION
AWS_REGION=${AWS_REGION:-us-east-1}

# Ask for stack name
read -p "CloudFormation stack name [github-create-lambda]: " STACK_NAME
STACK_NAME=${STACK_NAME:-github-create-lambda}

echo ""
echo "Deploying with:"
echo "  Profile: $AWS_PROFILE"
echo "  Region:  $AWS_REGION"
echo "  Stack:   $STACK_NAME"
echo ""
read -p "Continue? [Y/n] " CONFIRM
CONFIRM=${CONFIRM:-Y}
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "Building and deploying via Docker (SAM CLI inside container)..."
echo ""

docker run --rm -it \
  -v "$SCRIPT_DIR":/project \
  -v "$HOME/.aws":/root/.aws:ro \
  -w /project \
  -e AWS_PROFILE="$AWS_PROFILE" \
  -e AWS_DEFAULT_REGION="$AWS_REGION" \
  public.ecr.aws/sam/build-nodejs20.x:latest \
  bash -c "
    pip install -q aws-sam-cli 2>/dev/null
    sam build
    sam deploy \
      --stack-name $STACK_NAME \
      --region $AWS_REGION \
      --resolve-s3 \
      --capabilities CAPABILITY_IAM \
      --no-confirm-changeset \
      --no-fail-on-empty-changeset
  "

echo ""
echo "=== Deploy complete ==="
echo ""
echo "Next steps:"
echo "  1. Go to AWS Console → Lambda → github-create-lambda"
echo "  2. Add TOKEN_* environment variables with your GitHub PATs"
echo "  3. The API Gateway URL is in the CloudFormation stack outputs"
echo ""
echo "To get your API URL:"
echo "  aws cloudformation describe-stacks --stack-name $STACK_NAME --profile $AWS_PROFILE --region $AWS_REGION --query 'Stacks[0].Outputs' --output table"
