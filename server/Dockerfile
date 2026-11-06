FROM python:3.13-alpine
RUN adduser -D -u 10001 app && mkdir /data && chown app:app /data
USER app
WORKDIR /app
COPY app.py .
EXPOSE 8080
HEALTHCHECK CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=3)"
CMD ["python", "-u", "app.py"]
