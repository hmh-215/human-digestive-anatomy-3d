import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCacheThreadingHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

def run_port(port):
    server = ThreadingHTTPServer(('0.0.0.0', port), NoCacheThreadingHandler)
    print(f"Server running on http://localhost:{port} (ThreadingHTTPServer)", flush=True)
    server.serve_forever()

if __name__ == '__main__':
    t1 = threading.Thread(target=run_port, args=(8080,), daemon=True)
    t1.start()
    run_port(8085)
