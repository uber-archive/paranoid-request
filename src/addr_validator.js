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

import ip from 'ip';

// `ip.isPrivate()` is pretty jank, let's use our own list of "private" CIDRs
// Mix of addresses from ipaddress.py and SafeCurl, thank ya @fin1te!
const privateCIDRs = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/29',
  '192.0.0.170/31',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
  '255.255.255.255/32'
].map(ip.cidrSubnet);

class AddrValidator {
  constructor(options = {}) {
    if (options.portBlacklist && options.portBlacklist.length &&
      options.portWhitelist && options.portWhitelist.length) {
      throw new Error('Only support port whitelist or blacklist, not both!');
    }

    if (options.portWhitelist === undefined) {
      options.portWhitelist = this.DEFAULT_PORT_WHITELIST.slice();
    }

    this.ipBlacklist = (options.ipBlacklist || []).map(maybeParseCIDR);
    this.ipWhitelist = (options.ipWhitelist || []).map(maybeParseCIDR);
    this.portBlacklist = (options.portBlacklist || []);
    this.portWhitelist = (options.portWhitelist || []);
    // Maybe later.
    // if (options.autodetectLocalAddresses === undefined) {
    //   this.autodetectLocalAddresses = true;
    // } else {
    //   this.autodetectLocalAddresses = options.autodetectLocalAddresses;
    // }
  }

  isSafeIP(address) {
    // IPv6 get out.
    if (!address || !ip.isV4Format(address)) {
      return false;
    }

    // The whitelist can be used to punch holes in the blacklist
    const whitelisted = this.ipWhitelist.some(cidr => cidr.contains(address));
    if (whitelisted) {
      return true;
    }

    // Return any private or specifically blacklisted IPs
    return !privateCIDRs.concat(this.ipBlacklist).some(cidr => cidr.contains(address));
  }

  isSafePort(port) {
    if (typeof port !== 'number') {
      return false;
    } else if (port > 65535 || port < 1) {
      return false;
    } else if (this.portWhitelist.length) {
      return this.portWhitelist.indexOf(port) !== -1;
    } else if (this.portBlacklist.length) {
      return this.portBlacklist.indexOf(port) === -1;
    }
    return true;
  }
}

function maybeParseCIDR(ipAddr) {
  if (typeof ipAddr === 'string') {
    return ip.cidrSubnet(ipAddr);
  }

  return ipAddr;
}

// An assortment of common HTTPS? ports.
AddrValidator.prototype.DEFAULT_PORT_WHITELIST = [80, 8080, 443, 8443, 8000];

module.exports = AddrValidator;
