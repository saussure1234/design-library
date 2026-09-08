import http.server, os, socketserver
os.chdir("/Users/sohayashi/design-library/docs")
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1",8791), http.server.SimpleHTTPRequestHandler) as h: h.serve_forever()
