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

import test from 'tape';
import paranoid from '../index';

export function testForErrors(t, err, params) {
  const {shouldError, errorMessage, errorName, errorAssertions} = params;

  if (!shouldError) {
    t.equal(err, null, 'Has no request errors');
    return;
  }

  const assertErrorName = errorName || 'UnacceptableAddressError';
  t.equal(err.name, assertErrorName, `Error name is "${assertErrorName}"`);

  const assertMessage = errorMessage || 'All addresses were blacklisted!';
  const assertMessageOutput = `Error message matches "${assertMessage}"`;
  if (assertMessage instanceof RegExp) {
    t.true(assertMessage.test(err.message), assertMessageOutput);
  } else {
    t.equal(err.message, assertMessage, assertMessageOutput);
  }

  if (errorAssertions) {
    Object.keys(errorAssertions).forEach(key => {
      const val = errorAssertions[key];

      t.equal(err[key], val, `Error property ${key} is ${val}.`);
    });
  }
}

export function assertResponse(params, t, {err, res}) {
  testForErrors(t, err, params);

  const {statusCode} = params;

  if (statusCode) {
    t.equal(res.statusCode, statusCode, 'Has expected status code');
  }
}

export function runRequestWithParams(params, options, cb) {
  if (typeof options === 'function') {
    cb = options;
  }

  const {requester} = options;

  const testRequester = requester || paranoid.get;

  testRequester(params, {}, (err, res, body) => {
    cb(null, {err, res, body});
  });
}

export function runTest(config) {
  const {name, requestParams, params} = config;

  test(name, t => {
    runRequestWithParams(requestParams, params, (ignoredErr, response) => {
      assertResponse(params, t, response);

      t.end();
    });
  });
}
