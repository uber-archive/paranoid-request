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

// Largely a copy of Request's index.js file.
/* globals process */
import semver from 'semver';
import extend from 'extend';
import helpers from 'request/lib/helpers';
import request from 'request';

const isFunction = helpers.isFunction;
const paramsHaveRequestBody = helpers.paramsHaveRequestBody;

import AddrValidator from './addr_validator';
import paranoidHttp from './http';
import paranoidHttps from './https';

const canUseKeepAlive = semver.gte(process.version, '0.11.0');

// organize params for patch, post, put, head, del
function initParams(uri, options, callback) {
  if (typeof options === 'function') {
    callback = options;
  }

  const params = {};
  if (typeof options === 'object') {
    extend(params, options, {uri});
  } else if (typeof uri === 'string') {
    extend(params, {uri});
  } else {
    extend(params, uri);
  }

  params.callback = callback || params.callback;
  return params;
}

function paranoid(uri, options, callback) {
  if (typeof uri === 'undefined') {
    throw new Error('undefined is not a valid uri or options object.');
  }

  const params = initParams(uri, options, callback);

  if (params.method === 'HEAD' && paramsHaveRequestBody(params)) {
    throw new Error('HTTP HEAD requests MUST NOT include a request body.');
  }

  return new paranoid.Request(params);
}

paranoid.defaults = function paranoidDefaults(options, requester) {
  const self = this;

  options = options || {};

  if (typeof options === 'function') {
    requester = options;
    options = {};
  }

  const defaults = wrapRequestMethod(self, options, requester);

  const verbs = ['get', 'head', 'post', 'put', 'patch', 'del', 'delete'];
  verbs.forEach(verb => {
    defaults[verb] = wrapRequestMethod(self[verb], options, requester, verb);
  });

  defaults.cookie = wrapRequestMethod(self.cookie, options, requester);
  defaults.jar = self.jar;
  defaults.defaults = self.defaults;
  return defaults;
};

paranoid.forever = function paranoidForever(agentOptions, optionsArg) {
  const options = {};

  if (optionsArg) {
    extend(options, optionsArg);
  }

  if (agentOptions) {
    options.agentOptions = agentOptions;
  }

  options.forever = true;
  return paranoid.defaults(options);
};

function verbFunc(verb) {
  const method = verb.toUpperCase();
  return (uri, options, callback) => {
    const params = initParams(uri, options, callback);
    params.method = method;
    return paranoid(params, params.callback);
  };
}

// define like this to please codeintel/intellisense IDEs
paranoid.get = verbFunc('get');
paranoid.head = verbFunc('head');
paranoid.post = verbFunc('post');
paranoid.put = verbFunc('put');
paranoid.patch = verbFunc('patch');
paranoid.del = verbFunc('delete');
paranoid.delete = verbFunc('delete');

paranoid.jar = request.jar;
paranoid.cookie = request.cookie;

function wrapRequestMethod(method, options, requester, verb) {

  return (uri, opts, callback) => {
    const params = initParams(uri, opts, callback);

    const target = {};
    extend(true, target, options, params);

    target.pool = params.pool || options.pool;

    if (verb) {
      target.method = verb.toUpperCase();
    }

    if (isFunction(requester)) {
      method = requester;
    }

    return method(target, target.callback);
  };
}

class PatchedRequest extends request.Request {
  constructor(options) {
    if (!options) {
      options = {};
    }
    if (options.httpModules) {
      throw new Error('Manually setting httpModules is unsupported');
    }
    options.httpModules = {
      'http:': paranoidHttp,
      'https:': paranoidHttps
    };
    super(options);
  }

  init(options) {
    if (!options) {
      options = {};
    }

    if (options.agentClass) {
      // This would allow accidentally bypassing the restrictions. Maybe we
      // should check they're using an agent based on ours instead?
      throw new Error('Manually setting agentClass is unsupported');
    }

    // Keep-Alive has to be disabled on 0.10.x because it will use
    // ForeverAgent instead of our patched Agents.
    if (!canUseKeepAlive && options.forever) {
      options.forever = false;
    }

    // Pass through to the original `Request.init`
    return super.init(options);
  }
}

paranoid.AddrValidator = AddrValidator;
paranoid.Request = PatchedRequest;
paranoid.initParams = initParams;
paranoid.httpModule = paranoidHttp;
paranoid.httpsModule = paranoidHttps;

module.exports = paranoid;
