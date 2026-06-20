import http.server
import ssl
import sys

port = 8000
if len(sys.argv) > 1:
    port = int(sys.argv[1])

server_address = ('0.0.0.0', port)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile='cert.pem', keyfile='key.pem')
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print(f"Serving HTTPS on 0.0.0.0 port {port} (https://localhost:{port}/)...")
httpd.serve_forever()
