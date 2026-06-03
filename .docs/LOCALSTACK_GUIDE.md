# LocalStack Testing Guide for Terraform

LocalStack is a fully functional local AWS cloud stack that allows you to test your Terraform infrastructure without deploying to real AWS and incurring costs.

## What is LocalStack?

LocalStack emulates AWS services on your local machine, including:
- EC2 (limited)
- ECR
- IAM
- Secrets Manager
- VPC, Subnets, Security Groups
- And many more AWS services


## Prerequisites

1. **Docker Desktop** - Running on your machine
2. **Docker Compose** - Installed
3. **AWS CLI** - Configured
4. **Terraform** - Installed

## Installation & Setup

### Step 1: Add LocalStack to Your Project

Create `docker-compose.localstack.yml`:

```yaml
version: '3.8'

services:
  localstack:
    container_name: localstack-terraform-test
    image: localstack/localstack:latest
    ports:
      - "4566:4566"            # LocalStack Gateway
      - "4510-4559:4510-4559"  # External services port range
    environment:
      - SERVICES=ec2,ecr,iam,secretsmanager,sts,kms
      - DEBUG=1
      - DOCKER_HOST=unix:///var/run/docker.sock
      - LOCALSTACK_HOST=localhost:4566
      - PERSISTENCE=1
      - DATA_DIR=/tmp/localstack/data
    volumes:
      - "./localstack-data:/tmp/localstack"
      - "/var/run/docker.sock:/var/run/docker.sock"
```

### Step 2: Start LocalStack

```bash
docker-compose -f docker-compose.localstack.yml up -d

# Check if it's running
docker logs localstack-terraform-test

# Should see: "Ready."
```

### Step 3: Configure AWS CLI for LocalStack

Create `~/.aws/credentials` (if not exists):
```ini
[localstack]
aws_access_key_id = test
aws_secret_access_key = test
```

Create `~/.aws/config`:
```ini
[profile localstack]
region = ap-southeast-1
output = json
```

## Testing Your Terraform with LocalStack

### Option 1: Create Separate LocalStack Configuration

Create `terraform/localstack/main.tf`:

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region                      = "ap-southeast-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    ec2            = "http://localhost:4566"
    ecr            = "http://localhost:4566"
    iam            = "http://localhost:4566"
    secretsmanager = "http://localhost:4566"
    sts            = "http://localhost:4566"
  }
}

# Copy your main.tf resources here (simplified for local testing)

# Test VPC
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = {
    Name = "localstack-test-vpc"
  }
}

# Test Subnet
resource "aws_subnet" "public_1" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = true
  tags = {
    Name = "localstack-test-subnet"
  }
}

# Test Security Group
resource "aws_security_group" "app_sg" {
  name        = "localstack-test-sg"
  description = "Test security group"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Test ECR Repository
resource "aws_ecr_repository" "backend" {
  name = "localstack-test-backend"
}

# Test Secrets Manager
resource "aws_secretsmanager_secret" "neondb_creds" {
  name = "localstack-test/neondb-credentials"
}

resource "aws_secretsmanager_secret_version" "neondb_creds_version" {
  secret_id     = aws_secretsmanager_secret.neondb_creds.id
  secret_string = jsonencode({
    prod_db_url = "postgresql://test:test@localhost/test"
    sim_db_url  = "postgresql://test:test@localhost/test_sim"
  })
}
```

Create `terraform/localstack/variables.tf`:

```hcl
variable "aws_region" {
  description = "The AWS region to deploy resources in."
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "A name for the project to prefix resources."
  type        = string
  default     = "localstack-test"
}
```

### Option 2: Use Environment Variables (Simpler)

Set these environment variables before running Terraform:

```bash
# Windows PowerShell
$env:AWS_ACCESS_KEY_ID="test"
$env:AWS_SECRET_ACCESS_KEY="test"
$env:AWS_ENDPOINT_URL="http://localhost:4566"

# Linux/Mac
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_ENDPOINT_URL=http://localhost:4566
```

## Testing Workflow

### 1. Start LocalStack

```bash
docker-compose -f docker-compose.localstack.yml up -d

# Wait for it to be ready
docker logs -f localstack-terraform-test
# Wait for "Ready." message
```

### 2. Run Terraform Against LocalStack

```bash
cd terraform/localstack

# Initialize
terraform init

# Plan (see what will be created)
terraform plan

# Apply (create resources in LocalStack)
terraform apply -auto-approve
```

### 3. Verify Resources Created

```bash
# List VPCs
aws --endpoint-url=http://localhost:4566 ec2 describe-vpcs

# List ECR repositories
aws --endpoint-url=http://localhost:4566 ecr describe-repositories

# List Secrets Manager secrets
aws --endpoint-url=http://localhost:4566 secretsmanager list-secrets

# Get secret value
aws --endpoint-url=http://localhost:4566 secretsmanager get-secret-value --secret-id localstack-test/neondb-credentials
```

### 4. Test Changes

Make changes to your Terraform files and reapply:

```bash
terraform plan
terraform apply
```

### 5. Destroy Resources

```bash
terraform destroy -auto-approve
```

### 6. Stop LocalStack

```bash
docker-compose -f docker-compose.localstack.yml down
```

## Limitations of LocalStack

### What Works Well
- VPC, Subnets, Security Groups
- ECR repositories (limited)
- IAM roles and policies
- Secrets Manager
- Basic infrastructure validation

### What Doesn't Work Well
- EC2 instances (can't actually run)
- RDS instances (basic emulation only)
- Real container deployments
- Network connectivity between services
- Some advanced AWS features

### Best Use Cases
1. **Syntax validation** - Ensure Terraform configs are correct
2. **Resource dependencies** - Test resource relationships
3. **IAM policies** - Validate policy syntax
4. **Quick iterations** - Test changes rapidly
5. **CI/CD testing** - Automated infrastructure tests

## Practical Testing Strategy

Since LocalStack can't fully emulate EC2/Docker deployments, here's a practical approach:

### Phase 1: LocalStack (Local Testing)
Test basic infrastructure:
- VPC/Networking setup
- Security group rules
- ECR repositories creation
- Secrets Manager functionality
- IAM role/policy syntax

### Phase 2: AWS Dev Environment
Deploy to a real AWS dev/staging environment:
- Actual EC2 instances
- Real container deployments
- Full application testing
- Network connectivity testing

### Phase 3: Production
Deploy to production after validation

## Example: Testing Your Current Terraform

Create a simplified test version `terraform/localstack-test.tf`:

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region                      = "ap-southeast-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    ec2            = "http://localhost:4566"
    ecr            = "http://localhost:4566"
    iam            = "http://localhost:4566"
    secretsmanager = "http://localhost:4566"
  }
}

# Test your networking setup
module "networking" {
  source = "../"  # Your main terraform directory
  
  # Override variables for testing
  project_name = "localstack-test"
  
  # Mock secrets (won't actually connect to NeonDB)
  neon_prod_db_url = "postgresql://test:test@localhost/test"
  neon_sim_db_url  = "postgresql://test:test@localhost/test_sim"
  auth_jwt_secret  = "test-secret"
  inv_jwt_secret   = "test-secret"
  remember_token   = "test-token"
  session_secret   = "test-session"
  aws_account_id   = "000000000000"
}
```

## Advanced: LocalStack Pro Features

LocalStack Pro ($30/month) adds:
- Better EC2 emulation
- RDS support
- Lambda execution
- CloudFormation
- More realistic AWS behavior

**For basic Terraform testing, free version is sufficient!**

## Automated Testing Script

Create `test-terraform-local.sh`:

```bash
#!/bin/bash

echo "Starting LocalStack..."
docker-compose -f docker-compose.localstack.yml up -d

echo "Waiting for LocalStack to be ready..."
sleep 10

echo "Testing Terraform configuration..."
cd terraform/localstack

terraform init
terraform plan -out=tfplan

if [ $? -eq 0 ]; then
    echo "Terraform plan succeeded!"
    
    terraform apply tfplan
    
    if [ $? -eq 0 ]; then
        echo "Terraform apply succeeded!"
        
        # Verify resources
        echo "Verifying resources..."
        aws --endpoint-url=http://localhost:4566 ec2 describe-vpcs
        aws --endpoint-url=http://localhost:4566 ecr describe-repositories
        
        echo "Cleaning up..."
        terraform destroy -auto-approve
    else
        echo "Terraform apply failed!"
        exit 1
    fi
else
    echo "Terraform plan failed!"
    exit 1
fi

cd ../..
docker-compose -f docker-compose.localstack.yml down

echo "All tests passed!"
```

Make it executable:
```bash
chmod +x test-terraform-local.sh
./test-terraform-local.sh
```

## Windows PowerShell Version

Create `test-terraform-local.ps1`:

```powershell
Write-Host "Starting LocalStack..." -ForegroundColor Green
docker-compose -f docker-compose.localstack.yml up -d

Write-Host "Waiting for LocalStack to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host "Testing Terraform configuration..." -ForegroundColor Green
Set-Location terraform\localstack

terraform init
terraform plan -out=tfplan

if ($LASTEXITCODE -eq 0) {
    Write-Host "Terraform plan succeeded!" -ForegroundColor Green
    
    terraform apply tfplan
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Terraform apply succeeded!" -ForegroundColor Green
        
        Write-Host "Verifying resources..." -ForegroundColor Yellow
        aws --endpoint-url=http://localhost:4566 ec2 describe-vpcs
        aws --endpoint-url=http://localhost:4566 ecr describe-repositories
        
        Write-Host "Cleaning up..." -ForegroundColor Yellow
        terraform destroy -auto-approve
    } else {
        Write-Host "Terraform apply failed!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Terraform plan failed!" -ForegroundColor Red
    exit 1
}

Set-Location ..\..
docker-compose -f docker-compose.localstack.yml down

Write-Host "All tests passed!" -ForegroundColor Green
```

Run it:
```powershell
.\test-terraform-local.ps1
```

## Benefits of Using LocalStack

1. **Cost Savings** - No AWS charges during development
2. **Fast Iteration** - Instant resource creation/destruction
3. **Safe Testing** - Can't accidentally affect production
4. **Offline Development** - Work without internet
5. **Automated Testing** - Include in CI/CD pipelines
6. **Learning** - Practice Terraform without risk

## Summary

**LocalStack is perfect for:**
- Validating Terraform syntax
- Testing infrastructure code logic
- Quick development iterations
- Automated testing in CI/CD

**But remember:**
- It's an emulation, not real AWS
- Some features don't work fully
- Always test in real AWS dev environment before production

For your project, use LocalStack to validate your Terraform changes quickly, then deploy to a real AWS dev/test environment for full validation!

