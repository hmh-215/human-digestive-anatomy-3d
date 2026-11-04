from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCacheThreadingHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', 8085), NoCacheThreadingHandler)
    print("Server running on port 8085 (ThreadingHTTPServer)", flush=True)
    server.serve_forever()
