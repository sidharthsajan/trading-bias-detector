# AWS Deployment (ECS Fargate + RDS)

## Prerequisites

- **RDS**: PostgreSQL instance. Set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (and optionally `DB_PORT`) in the backend task definition or Parameter Store.
- **ECR**: Create two repositories: `trading-bias-frontend`, `trading-bias-backend`.
- **ECS**: Create cluster and two Fargate services (frontend and backend). Point backend to RDS; frontend can proxy `/api` to the backend service or use an ALB with path-based routing.
- **OIDC**: In AWS IAM, add a GitHub OIDC identity provider and create a role that trusts `sts.amazonaws.com` with condition `token.actions.githubusercontent.com:sub` for your repo. Grant the role permissions to push to ECR and to `ecs:UpdateService` on your cluster. Set the role ARN as `AWS_ROLE_ARN` in the repo’s GitHub Actions secrets.

## GitHub Actions

- Workflow: `.github/workflows/deploy.yml`
- Triggers on push to `main`.
- Uses OIDC to assume the IAM role (no long-lived keys).
- Builds and pushes Docker images to ECR, then forces a new deployment on both ECS services.

## Local

- `docker compose up -d` for Postgres.
- Backend: `cd backend && uv run uvicorn app.main:app --reload` (set `DB_*` in `.env`).
- Frontend: `cd frontend && npm run dev` (Vite proxies `/api` to `http://localhost:8000`).
