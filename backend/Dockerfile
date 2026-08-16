FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY config.yaml .
COPY --from=frontend-build /frontend/dist /frontend-dist
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
