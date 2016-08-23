// Copyright (c) 2016 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/* globals process */

import paranoidHttp from '../http';
import paranoidHttps from '../https';
import net from 'net';
import dns from 'dns';
import sinon from 'sinon';
import test from 'tape';
import paranoid from '../index';

import semver from 'semver';
import AddrValidator from '../addr_validator';

test('HTTP doesn\'t hit net.createConnection', t => {
  const mock = sinon.mock(net);
  mock.expects('createConnection').never();
  paranoid.get('http://example.com/', {}, (ignoredErr, res, body) => {
    mock.verify();
    t.end();
  });
});

// If `dns.lookup()` is called more than once, it's likely that
// we're not using the resolved address for the actual connection
// creating a TOCTOU vuln.
test('dns.lookup() only called once', function assert(t) {
  const lookupSpy = sinon.spy(dns, 'lookup');
  const options = {uri: 'http://example.com/'};
  paranoid.get(options, function onFirstGet() {
    dns.lookup.restore();
    if (semver.gte(process.version, '2.0.0')) {
      t.true(lookupSpy.calledOnce, 'dns.lookup() called once');
    } else {
      // Annoyingly, our manual `socket.connect()` will internally
      // call `dns.lookup()` on Node < 2.0, but it should be a no-op
      // with our sanitized IP address.
      t.true(lookupSpy.calledTwice, 'dns.lookup() called twice');
      // Make sure the last lookup (for `Socket.connect`) was made with the IP)
      t.true(net.isIP(lookupSpy.lastCall.args[0]), 'second dns.lookup() called with IP');
    }

    t.end();
  });
});

if (semver.gte(process.version, '0.11.0')) {
  test('Paranoid agents can pool connections', function assert(t) {
    const sockConnSpy = sinon.spy(net.Socket.prototype, 'connect');
    const options = {uri: 'http://example.com/', forever: true};
    paranoid.get(options, function onFirstGet() {
      paranoid.get(options, function onSecondGet() {
        net.Socket.prototype.connect.restore();
        t.true(sockConnSpy.calledOnce, 'Socket.connect called once');
        t.end();
      });
    });
  });

  test('Paranoid connection pool splits on validator rules', function assert(t) {
    const addrValidator = new AddrValidator({portWhitelist: [80, 8001]});
    const sockConnSpy = sinon.spy(net.Socket.prototype, 'connect');
    const options = {uri: 'http://example.com/', forever: true, addrValidator};
    paranoid.get(options, function onFirstGet() {
      addrValidator.portWhitelist.push(9001);
      paranoid.get(options, function onSecondGet() {
        net.Socket.prototype.connect.restore();
        t.true(sockConnSpy.calledTwice, 'Socket.connect called twice');
        t.end();
      });
    });
  });
} else {
  // Node 0.10 won't use our safe agent if `forever: true` is
  // used, make sure we don't pool connections there.
  test('Paranoid agents don\'t pool connections', function assert(t) {
    const sockConnSpy = sinon.spy(net.Socket.prototype, 'connect');
    const options = {uri: 'http://example.com/', forever: true};
    paranoid.get(options, function onFirstGet() {
      paranoid.get(options, function onSecondGet() {
        net.Socket.prototype.connect.restore();
        t.true(sockConnSpy.calledTwice, 'Socket.connect called twice');
        t.end();
      });
    });
  });
}

// //////
// HTTP module wrapper tests
// //////

test('Normal hostname HTTP module', t => {
  const client = paranoidHttp.get('http://example.com/', res => {
    t.equal(res.statusCode, 200);
    // Necessary or Node 0.10.x will keep the connections open forever
    // and hang the tests. neat.
    client.destroy();
    t.end();
  });
});

test('Normal hostname HTTPS module', t => {
  const client = paranoidHttps.get('https://example.com/', res => {
    t.equal(res.statusCode, 200);
    client.destroy();
    t.end();
  });
});

function assertUnacceptableAddressError(t, err) {
  t.equal(err.message, 'All addresses were blacklisted!', 'Has blacklisted error.');
  t.equal(err.name, 'UnacceptableAddressError', 'Has UnacceptableAddressError error name.');
}

test('Blacklisted hostname HTTP module', t => {
  t.plan(2);
  const client = paranoidHttp.get('http://localhost/', res => {
    t.fail('Got a response');
    client.destroy();
  }).on('error', err => {
    assertUnacceptableAddressError(t, err);
    client.destroy();
  });
});

test('Blacklisted hostname HTTPS module', t => {
  t.plan(2);
  const client = paranoidHttps.get('https://localhost/', res => {
    t.fail('Got a response');
    client.destroy();
  }).on('error', err => {
    assertUnacceptableAddressError(t, err);
    client.destroy();
  });
});
