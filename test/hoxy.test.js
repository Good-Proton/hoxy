/*
 * Copyright (c) 2015 by Greg Reimer <gregreimer@gmail.com>
 * MIT License. See mit-license.txt for more info.
 */

import { Proxy } from '../src/main'
import send from './lib/send'
import assert from 'assert'
import http from 'http';

describe('hoxy', function () {

  it('should accept a valid upstream proxy', () => {
    let proxy = new Proxy({
      upstreamProxy: 'localhost:8080',
    })
  })

  it('should accept a valid upstream proxy', () => {
    let proxy = new Proxy({
      upstreamProxy: 'http://example.com:7070',
    })
  })

  it('should accept a valid upstream proxy', () => {
    let proxy = new Proxy({
      upstreamProxy: 'https://localhost:9090',
    })
  })

  it('should reject an invalid upstream proxy', () => {
    assert.throws(() => {
      let proxy = new Proxy({
        upstreamProxy: 'localhost:8080/foo',
      })
    }, /invalid/)
  })

  it('should reject an invalid upstream proxy', () => {
    assert.throws(() => {
      let proxy = new Proxy({
        upstreamProxy: 'localhost',
      })
    }, /invalid/)
  })

  it('should reject an invalid upstream proxy', () => {
    assert.throws(() => {
      let proxy = new Proxy({
        upstreamProxy: 'http://localhost',
      })
    }, /invalid/)
  })

  it('should reject an invalid upstream proxy', () => {
    assert.throws(() => {
      let proxy = new Proxy({
        upstreamProxy: 'http:localhost:8080',
      })
    }, /invalid/)
  })

  it('should actually use an upstream proxy', done => {
    let upstream = new Proxy().listen(0, () => {
      let upstreamProxy = `localhost:${upstream.address().port}`
      send({}, false, { upstreamProxy }).promise().catch(done)
    })
    upstream.intercept('request', () => done())
  })

  it('should use an upstream proxy from request', done => {
    let proxyUpstream = new Proxy().listen(0, () => {
      let requestUpsteam = new Proxy().listen(0, () => {
        send({}, false, { upstreamProxy: `localhost:${proxyUpstream.address().port}` })
          .through('request', req => {
            req.upstreamProxy = `localhost:${requestUpsteam.address().port}`
          })
          .promise()
          .catch(done)
      })
      requestUpsteam.intercept('request', () => done())
    })
    proxyUpstream.intercept('request', () => done(new Error('incorrect upstream proxy')))
  })

  it.only('should not use an upstream proxy if it is `null` in request', done => {
    let upstream = new Proxy(
    ).listen(0, () => {
      send({}, false, { upstreamProxy: `localhost:${upstream.address().port}` })
        .through('request', req => {
          req.upstreamProxy = ''
        })
        .promise()
        .then(() => done(), done)
    })
    upstream.intercept('request', () => {
      done('upstream proxy used')
      throw new Error('upstream proxy used')
    })
  })

  describe('should properly handle connection errors', () => {
    async function createServer(timeout, delay) {
      const server = http.createServer((req, res) => {
        if (timeout) {
          res.setTimeout(timeout);
        }

        req.on('data', chunk => { });
        req.on('end', async () => {
          if (!res.destroyed) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            if (delay) {
              await new Promise(r => setTimeout(r, delay));
            }
            res.end(`${req.method} ${req.url}`);
          }
        });
      });

      await new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, 'localhost', resolve);
      });

      return server;
    }

    async function createUpstreamProxy(
      handler = (fromClient, toClient) => {
        const toServer = http.request(fromClient.url, {
          host: fromClient.headers.host,
          headers: fromClient.headers,
          method: fromClient.method
        });
        fromClient.on('data', chunk => toServer.write(chunk, 'binary'));
        fromClient.on('end', () => toServer.end());
        toServer.on('error', e => {
          toClient.destroy(e);
          fromClient.destroy(e);
        });
        toServer.on('response', fromServer => {
          fromServer.on('error', e => {
            toClient.destroy(e);
            fromClient.destroy(e);
          });
          fromServer.on('data', chunk => toClient.write(chunk, 'binary'));
          fromServer.on('end', () => toClient.end());
          toClient.writeHead(fromServer.statusCode, fromServer.headers);
        });
      }
    ) {
      const upstreamProxy = http.createServer(handler);

      await new Promise((resolve, reject) => {
        upstreamProxy.on('error', reject);
        upstreamProxy.listen(0, 'localhost', resolve);
      });

      return upstreamProxy;
    }

    async function createProxy(upstreamProxy) {
      const proxy = new Proxy({ upstreamProxy });

      await new Promise((resolve, reject) => {
        proxy.on('error', reject);
        proxy.listen(0, 'localhost', resolve);
      });

      return proxy;
    }

    async function post(opts, cb) {
      return new Promise((resolve, reject) => {
        const request = http.request({
          method: 'POST',
          ...opts
        });

        cb(request);

        request.on('response', resolve);
        request.on('error', reject);
      });
    }

    async function get(opts) {
      return new Promise((resolve, reject) => http.get(opts, resolve).on('error', reject));
    }

    it('should handle upstream proxy connection errors (invalid port)', async () => {
      const server = await createServer();
      const upstreamProxy = await createUpstreamProxy();
      const proxy = await createProxy(`localhost:0`);
      const proxyAddr = proxy.address();

      let interceptedRequest;
      let interceptedResponse;
      proxy.intercept('request', req => interceptedRequest = req);
      proxy.intercept('response', (req, res) => interceptedResponse = res);

      await get({
        hostname: proxyAddr.address,
        port: proxyAddr.port,
        path: `http://localhost:${server.address().port}/foo`,
      }).then(() => {
        assert.fail('request should fail');
      }, e => {
        assert.ok(true, 'request should fail');
        assert.equal(e.code, 'ECONNRESET');

        assert.ok(interceptedRequest, 'request was intercepted');
        assert.ok(interceptedResponse, 'response was intercepted');

        assert.equal(interceptedResponse.statusCode, -500);
        const xProxyOriginalError = JSON.parse(interceptedResponse.headers['x-proxy-original-error'])
        assert.ok(xProxyOriginalError.code);
      });
    });

    it('should handle upstream proxy connection errors (timeout request to server)', async () => {
      const server = await createServer(1);
      const upstreamProxy = await createUpstreamProxy();
      const proxy = await createProxy(`localhost:${upstreamProxy.address().port}`);

      let interceptedRequest;
      let interceptedResponse;
      proxy.intercept('request', req => interceptedRequest = req);
      proxy.intercept('response', (req, res) => interceptedResponse = res);

      await post({
        hostname: proxy.address().address,
        port: proxy.address().port,
        path: `http://localhost:${server.address().port}/foo`,
      }, req => {
        req.write('s');
        req.on('error', e => { });
        setTimeout(() => req.end(), 20);
      }).then(
        () => {
          assert.fail('request should fail');
        },
        e => {
          assert.ok(true, 'request should fail');
          assert.equal(e.code, 'ECONNRESET');

          assert.ok(interceptedRequest, 'request was intercepted');
          assert.ok(interceptedResponse, 'response was intercepted');

          assert.equal(interceptedResponse.statusCode, -500);
          const xProxyOriginalError = JSON.parse(interceptedResponse.headers['x-proxy-original-error'])
          assert.ok(xProxyOriginalError.code);
        }
      );
    });

    it('should handle upstream proxy connection errors (timeout response from server)', async () => {
      const server = await createServer(50, 2000);
      const upstreamProxy = await createUpstreamProxy();
      const proxy = await createProxy(`localhost:${upstreamProxy.address().port}`);

      let interceptedRequest;
      let interceptedResponse;
      proxy.intercept('request', req => interceptedRequest = req);
      proxy.intercept('response', (req, res) => interceptedResponse = res);

      await get({
        hostname: proxy.address().address,
        port: proxy.address().port,
        path: `http://localhost:${server.address().port}/foo`,
      }).then(
        () => {
          assert.fail('request should fail');
        },
        e => {
          assert.ok(true, 'request should fail');
          assert.equal(e.code, 'ECONNRESET');

          assert.ok(interceptedRequest, 'request was intercepted');
          assert.ok(interceptedResponse, 'response was intercepted');

          assert.equal(interceptedResponse.statusCode, -500);
          const xProxyOriginalError = JSON.parse(interceptedResponse.headers['x-proxy-original-error'])
          assert.ok(xProxyOriginalError.code);
        }
      );
    });

    it('should handle upstream proxy connection errors (upstreamProxy closes socket midway)', async () => {
      const server = await createServer();
      const upstreamProxy = await createUpstreamProxy((fromClient, toClient) => {
        const toServer = http.request(fromClient.url, {
          host: fromClient.headers.host,
          headers: fromClient.headers,
          method: fromClient.method
        });
        fromClient.on('data', chunk => toServer.write(chunk, 'binary'));
        fromClient.on('end', () => toServer.end());
        toServer.on('error', e => {
          toClient.destroy(e);
          fromClient.destroy(e);
        });
        toServer.on('response', fromServer => {
          fromServer.on('error', e => {
            toClient.destroy(e);
            fromClient.destroy(e);
          });
          fromServer.on('data', chunk => toClient.write(chunk, 'binary'));
          fromServer.on('end', () => toClient.destroy());
          toClient.writeHead(fromServer.statusCode, fromServer.headers);
        });
      });
      const proxy = await createProxy(`localhost:${upstreamProxy.address().port}`);

      let interceptedRequest;
      let interceptedResponse;
      proxy.intercept('request', req => interceptedRequest = req);
      proxy.intercept('response', (req, res) => interceptedResponse = res);

      await get({
        hostname: proxy.address().address,
        port: proxy.address().port,
        path: `http://localhost:${server.address().port}/foo`,
      }).then(
        () => {
          assert.fail('request should fail');
        },
        e => {
          assert.ok(true, 'request should fail');
          assert.equal(e.code, 'ECONNRESET');

          assert.ok(interceptedRequest, 'request was intercepted');
          assert.ok(interceptedResponse, 'response was intercepted');

          assert.equal(interceptedResponse.statusCode, -500);
          const xProxyOriginalError = JSON.parse(interceptedResponse.headers['x-proxy-original-error'])
          assert.ok(xProxyOriginalError.code);
        }
      );
    });
  });
})
