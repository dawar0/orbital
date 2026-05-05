import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from platform import system
from threading import Thread

from loguru import logger
from rq import SimpleWorker, Worker

from app.core.logging import configure_logging
from app.jobs.queues import get_redis_connection
from app.services.ingestion.constants import INGESTION_QUEUE_NAME


class WorkerHealthHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"ok\n")

    def log_message(self, format: str, *args: object) -> None:
        message = format % args if args else format
        logger.debug("Worker health check: {message}", message=message)


def start_health_server() -> None:
    port = os.environ.get("PORT")
    if port is None:
        return

    server = ThreadingHTTPServer(("0.0.0.0", int(port)), WorkerHealthHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info("Started worker health server port={port}", port=port)


def build_worker() -> Worker | SimpleWorker:
    worker_class = SimpleWorker if system() == "Darwin" else Worker
    return worker_class([INGESTION_QUEUE_NAME], connection=get_redis_connection())


def main() -> None:
    configure_logging()
    start_health_server()
    worker = build_worker()
    logger.info(
        "Starting RQ worker for queue={queue} worker_class={worker_class}",
        queue=INGESTION_QUEUE_NAME,
        worker_class=type(worker).__name__,
    )
    worker.work()


if __name__ == "__main__":
    main()
