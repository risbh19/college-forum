FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home forum
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini .
USER forum
EXPOSE 8000
CMD ["python", "-m", "app.serve"]
