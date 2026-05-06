FROM python:3.11-slim

WORKDIR /workspace/services/sim-service
COPY services/sim-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/sim-service/app app
COPY controllers /workspace/controllers
COPY worlds /workspace/worlds

EXPOSE 8081
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8081"]
