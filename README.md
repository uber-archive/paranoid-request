# paranoid-request

An SSRF-preventing wrapper around Node's request module, as well as the
lower-level `http` and `https` modules.

## Overview

Server Side Request Forgery (SSRF) is a vulnerability that appears when an
attacker has the ability to create requests from a vulnerable server.

This can allow the attacker to make requests to localhost,
thereby exposing sensitive internal services that are behind the firewall.

This library prevents this category of attacks by preventing the requests from firing.

For more info on SSRF vulnerabilities, check out
[this article](http://www.acunetix.com/blog/articles/server-side-request-forgery-vulnerability/).

## Usage

Exactly the same as https://www.npmjs.com/package/request, with the addition
that we will emit an 'error' event with an `UnacceptableAddressError` when we
can't find a suitable address.

```javascript
var paranoid = require("paranoid-request");

// These two will be blocked
paranoid.get("http://localhost/", function(err, res, body) {
    console.log(err && err.message);
    // All addresses were blacklisted!
});

paranoid.get("http://example.com:9000/", function(err, res, body) {
    console.log(err && err.message);
    // Disallowed port detected
});

// but this is fine
paranoid.get("http://example.com/", function(err, res, body) {
    console.log(res.statusCode);
    // 200
});
```

If you want a custom set of validation rules, you can also roll your
own version of `paranoid-request`:

```javascript
var paranoid = require("paranoid-request");

// example.com's IP
var exampleComIp = "93.184.216.34";
var exampleComCIDR = exampleComIp + "/32";
var exampleComIpURL = "http://" + exampleComIp + "/";

// Make a wrapper that blocks example.com's IP by default
var moreParanoid = paranoid.defaults({
  addrValidator: new paranoid.AddrValidator({ipBlacklist: [exampleComCIDR]})
});

// Now requests to example.com's IP should be blocked
moreParanoid.get(exampleComIpURL, function(err, res, body) {
  console.log(err && err.message);
  // All addresses were blacklisted!
});
```

You can also use `paranoid-request`'s paranoid wrappers for the stdlib's `http`
and `https` as well via `require("paranoid-request").httpModule` and
`require("paranoid-request").httpsModule`, respectively. However, I don't recommend it.

## Testing

* `npm install`
* `npm test`

## Installation

```
npm install paranoid-request
```

## Development

Develop like any other node module. Please write tests for any new code you add!
