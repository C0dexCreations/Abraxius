const http = require("http");
const { API_PORT } = require("./server");

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: API_PORT,
      path,
      method,
      headers: { "Content-Type": "application/json" },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const obj = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(obj.error || `HTTP ${res.statusCode}`);
            err.statusCode = res.statusCode;
            err.body = obj;
            reject(err);
          } else {
            resolve(obj);
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on("error", (err) => {
      err.message = `Cannot connect to MCP daemon on localhost:${API_PORT}. Is it running? (${err.message})`;
      reject(err);
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

class MCPClient {
  async health() {
    return request("GET", "/health");
  }

  async tools() {
    return request("GET", "/tools");
  }

  async call(name, args = {}) {
    return request("POST", "/call", { name, arguments: args });
  }

  async state() {
    return request("GET", "/state");
  }

  async execute(code, datamodelType = "Edit") {
    return request("POST", "/execute", { code, datamodel_type: datamodelType });
  }

  async shutdown() {
    return request("POST", "/shutdown");
  }

  async log(message) {
    return request("POST", "/log", { message });
  }
}

module.exports = { MCPClient, request };
