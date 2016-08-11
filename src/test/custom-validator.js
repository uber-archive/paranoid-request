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

import async from 'async';
import extend from 'xtend';
import test from 'tape';
import paranoid from '../index';
import AddrValidator from '../addr_validator';
import {assertResponse, runRequestWithParams} from './test-utils';
import {params} from './test-params';

const {baseBadParams, baseGoodParams, badUri, notFound} = params;

// example.com's IP
const exampleComIp = '93.184.216.34';
const exampleComCIDR = `${exampleComIp}/32`;
const exampleComIpURL = `http://${exampleComIp}/`;

function runCustomValidatorTest(testParams) {
  const {name} = testParams;

  test(name, function runTest(t) {
    t.plan(5);

    async.series({
      goodResults: runRequestWithParams.bind(null, exampleComIpURL),
      badResults: runRequestWithParams.bind(null, extend({uri: exampleComIpURL}, testParams))
    }, function endTest(err, {goodResults, badResults}) {

      t.notOk(err, 'does not have error');

      assertResponse(extend(baseGoodParams, notFound), t, goodResults);

      assertResponse(extend(baseBadParams, badUri), t, badResults);

      t.end();
    });
  });
}

const addrValidator = new AddrValidator({ipBlacklist: [exampleComCIDR]});

runCustomValidatorTest({
  name: 'Custom AddrValidator works with request',
  addrValidator
});

// Same as above, but with a wrapper instead of explicitly passing `addrValidator`
runCustomValidatorTest({
  name: 'Custom AddrValidator wrapper for request',
  requester: paranoid.defaults({addrValidator}).get
});
