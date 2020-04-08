/*
 * Copyright (c) 2015 by Greg Reimer <gregreimer@gmail.com>
 * MIT License. See mit-license.txt for more info.
 */

import assert from 'assert'
import hoxy from '../src/main'
import http from 'http'

describe('non-existent servers', function () {
  it('should respond with ECONNRESET and intercept `-500` status with `x-original-error` header', done => {
    const proxy = hoxy.createServer({
      reverse: 'http://sdfkjhsdfdgjhhfs:8888',
    });
    proxy.listen(function () {
      let interceptedRequest;
      let interceptedResponse;
      proxy.intercept('request', req => interceptedRequest = req);
      proxy.intercept('response', (req, res) => interceptedResponse = res);

      const { address, port } = proxy.address()
      http.get({
        hostname: address,
        port: port,
        path: '/',
      }, res => {
        assert.fail('request should fail');
      }).on('error', e => {
        assert.ok(true, 'request should fail');
        assert.equal(e.code, 'ECONNRESET');

        assert.ok(interceptedRequest, 'request was intercepted');
        assert.ok(interceptedResponse, 'response was intercepted');

        assert.equal(interceptedResponse.statusCode, -500);
        const xProxyOriginalError = JSON.parse(interceptedResponse.headers['x-proxy-original-error'])
        assert.equal(xProxyOriginalError.code, 'ENOTFOUND');

        done();
      });
    })
    proxy.on('error', e => done(e));
  });
});
