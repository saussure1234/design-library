import http.server, os, socketserver
os.chdir("/Users/sohayashi/design-library")
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 5188), http.server.SimpleHTTPRequestHandler) as httpd:
    print("serving design-library on 5188")
    httpd.serve_forever()
