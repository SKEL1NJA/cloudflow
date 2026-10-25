import { lookup as dnsLookup } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { StepError } from './types.js';

const blockedV4 = new BlockList();
const blockedV6 = new BlockList();

const IPV4_RANGES: [string, number][] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, includes the cloud metadata address 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes the broadcast address
];

const IPV6_RANGES: [string, number][] = [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['::ffff:0:0', 96], // IPv4-mapped, which could smuggle in an IPv4 address
  ['64:ff9b::', 96], // NAT64, embeds an IPv4 address
  ['100::', 64], // discard-only
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4, embeds an IPv4 address
  ['fc00::', 7], // unique local (private)
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
];

for (const [network, prefix] of IPV4_RANGES) blockedV4.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of IPV6_RANGES) blockedV6.addSubnet(network, prefix, 'ipv6');

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blockedV4.check(address, 'ipv4');
  if (family === 6) return blockedV6.check(address, 'ipv6');
  return true; // anything that is not a valid IP address is refused
}

export class BlockedAddressError extends StepError {
  constructor(address: string) {
    super(`Requests to private or internal network addresses are blocked (${address})`, false);
    this.name = 'BlockedAddressError';
  }
}

export const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(
    hostname,
    { family: options.family, hints: options.hints, all: true },
    (err, addresses) => {
      if (err) {
        callback(err, '');
        return;
      }
      const forbidden = addresses.find((entry) => isBlockedAddress(entry.address));
      if (forbidden) {
        callback(new BlockedAddressError(forbidden.address), '');
        return;
      }
      if (options.all) {
        callback(null, addresses);
        return;
      }
      const first = addresses[0];
      if (!first) {
        callback(new Error(`No addresses found for ${hostname}`), '');
        return;
      }
      callback(null, first.address, first.family);
    },
  );
};
