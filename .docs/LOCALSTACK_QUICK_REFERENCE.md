# LocalStack Quick Reference

Quick commands for testing Terraform with LocalStack.

## Start/Stop LocalStack

```powershell
# Start LocalStack
docker-compose -f docker-compose.localstack.yml up -d

# View logs
docker logs -f cleospa-localstack

# Check status
docker ps | findstr localstack

# Stop LocalStack
docker-compose -f docker-compose.localstack.yml down

# Restart LocalStack
docker-compose -f docker-compose.localstack.yml restart
```

## Quick Test

```powershell
# Run automated test script
.\test-terraform-localstack.ps1
```

## Manual Terraform Commands

```powershell
cd terraform\localstack

# Initialize
terraform init

# Validate
terraform validate

# Plan
terraform plan

# Apply
terraform apply -auto-approve

# Show outputs
terraform output

# Destroy
terraform destroy -auto-approve
```

## AWS CLI Commands (LocalStack)

All commands need `--endpoint-url=http://localhost:4566`

### VPC/Networking

```powershell
# List VPCs
aws --endpoint-url=http://localhost:4566 ec2 describe-vpcs

# List Subnets
aws --endpoint-url=http://localhost:4566 ec2 describe-subnets

# List Security Groups
aws --endpoint-url=http://localhost:4566 ec2 describe-security-groups

# List Internet Gateways
aws --endpoint-url=http://localhost:4566 ec2 describe-internet-gateways
```

### ECR

```powershell
# List repositories
aws --endpoint-url=http://localhost:4566 ecr describe-repositories

# Get repository details
aws --endpoint-url=http://localhost:4566 ecr describe-repositories --repository-names localstack-cleospa-backend
```

### Secrets Manager

```powershell
# List secrets
aws --endpoint-url=http://localhost:4566 secretsmanager list-secrets

# Get secret value
aws --endpoint-url=http://localhost:4566 secretsmanager get-secret-value --secret-id localstack-cleospa/neondb-credentials

# Describe secret
aws --endpoint-url=http://localhost:4566 secretsmanager describe-secret --secret-id localstack-cleospa/neondb-credentials
```

### IAM

```powershell
# List roles
aws --endpoint-url=http://localhost:4566 iam list-roles

# Get role
aws --endpoint-url=http://localhost:4566 iam get-role --role-name localstack-cleospa-ec2-ecr-access-role

# List policies for role
aws --endpoint-url=http://localhost:4566 iam list-role-policies --role-name localstack-cleospa-ec2-ecr-access-role
```

## Troubleshooting

### LocalStack not starting
```powershell
# Check if port is in use
netstat -ano | findstr :4566

# Kill process using port (if needed)
# Get PID from above command, then:
taskkill /PID <PID> /F

# Remove old container
docker rm -f cleospa-localstack

# Start fresh
docker-compose -f docker-compose.localstack.yml up -d
```

### Terraform state issues
```powershell
cd terraform\localstack

# Remove state
rm terraform.tfstate*
rm -r .terraform

# Re-initialize
terraform init
```

### Can't connect to LocalStack
```powershell
# Test connection
curl http://localhost:4566/_localstack/health

# Or with PowerShell
Invoke-WebRequest -Uri http://localhost:4566/_localstack/health
```

## Environment Setup (Alternative)

If you prefer environment variables:

```powershell
# Set LocalStack endpoints
$env:AWS_ACCESS_KEY_ID="test"
$env:AWS_SECRET_ACCESS_KEY="test"
$env:AWS_ENDPOINT_URL="http://localhost:4566"

# Now AWS CLI will use LocalStack automatically
aws ec2 describe-vpcs
```

## Persistence

LocalStack data is stored in `localstack-data/` directory:

```powershell
# Clean all data (reset LocalStack)
docker-compose -f docker-compose.localstack.yml down
rm -r localstack-data

# Start fresh
docker-compose -f docker-compose.localstack.yml up -d
```

## Useful LocalStack URLs

- **Health**: http://localhost:4566/_localstack/health
- **Init Scripts**: http://localhost:4566/_localstack/init
- **Dashboard** (Pro): http://localhost:4566/_localstack/dashboard

## Common Workflows

### Test a Terraform change
```powershell
# 1. Start LocalStack
docker-compose -f docker-compose.localstack.yml up -d

# 2. Edit terraform/localstack/main.tf
# (make your changes)

# 3. Apply
cd terraform\localstack
terraform apply -auto-approve

# 4. Verify
terraform output
aws --endpoint-url=http://localhost:4566 ec2 describe-vpcs

# 5. Destroy
terraform destroy -auto-approve
```

### Compare Local vs Production config
```powershell
# View LocalStack plan
cd terraform\localstack
terraform plan > localstack-plan.txt

# View Production plan  
cd ..\
terraform plan > production-plan.txt

# Compare files
code --diff localstack-plan.txt production-plan.txt
```

## Cost

LocalStack Free Version: **$0/month**
- Includes most services you need
- Perfect for Terraform testing

LocalStack Pro: **$30/month** (optional)
- More services
- Better emulation
- Not needed for basic testing

## Next Steps

After LocalStack testing succeeds:
1. Configuration syntax is valid
2. Deploy to AWS dev/test environment
3. Test with real services
4. Deploy to production

See `DEPLOYMENT_GUIDE.md` for AWS deployment instructions.

