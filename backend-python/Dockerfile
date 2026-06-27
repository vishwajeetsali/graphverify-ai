# Use a Python 3.10 slim base image (optimal for CPU runtime)
FROM python:3.10-slim

# Install system dependencies:
# - tesseract-ocr for text extraction
# - wget for fetching resources if needed
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set working directory inside the container
WORKDIR /app

# Copy requirements file first to utilize Docker build cache
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy all python microservice files to the container
COPY . .

# Hugging Face Spaces default port is 7860
EXPOSE 7860

# Run the FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
