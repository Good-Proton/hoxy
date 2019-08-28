/*
 * Copyright (c) 2015 by Greg Reimer <gregreimer@gmail.com>
 * MIT License. See mit-license.txt for more info.
 */

import assert from 'assert'
import hoxy from '../src/main'
import http from 'http'

describe('non-existent servers', function(){

  it('should respond with 502 and `x-proxy-original-error` header', done => {

    const proxy = hoxy.createServer({
      reverse: 'http://sdfkjhsdfdgjhhfs:8888',
    })
    proxy.listen(function() {
      const { address, port } = proxy.address()
      http.get({
        hostname: address,
        port: port,
        path: '/',
      }, (resp) => {
          assert.equal(resp.statusCode, 502)
          assert.ok(resp.headers['x-proxy-original-error'])
          done();
      }).on('error', e => done(e))
    })
    proxy.on('error', e => done(e))
  })
})
