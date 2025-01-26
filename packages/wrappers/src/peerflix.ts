import { AddonDetail, StreamRequest } from '@aiostreams/types';
import { ParsedStream, Stream, Config } from '@aiostreams/types';
import { BaseWrapper } from './base';
import { addonDetails } from '@aiostreams/utils';
import { Settings } from '@aiostreams/utils';

interface PeerflixStream extends Stream {
  seed?: string;
  sizeBytes?: number;
  language?: string;
  quality?: string;
}

export class Peerflix extends BaseWrapper {
  constructor(
    configString: string | null,
    overrideUrl: string | null,
    addonName: string = 'Peerflix',
    addonId: string,
    userConfig: Config,
    indexerTimeout?: number
  ) {
    let url = overrideUrl
      ? overrideUrl
      : Settings.PEERFLIX_URL + (configString ? configString + '/' : '');

    super(
      addonName,
      url,
      addonId,
      userConfig,
      indexerTimeout || Settings.DEFAULT_PEERFLIX_TIMEOUT
    );
  }
}

export async function getPeerflixStreams(
  config: Config,
  peerflixOptions: {
    showP2PStreams?: string;
    useMultipleInstances?: string;
    overrideUrl?: string;
    indexerTimeout?: string;
    overrideName?: string;
  },
  streamRequest: StreamRequest,
  addonId: string
): Promise<ParsedStream[]> {
  const supportedServices: string[] =
    addonDetails.find((addon: AddonDetail) => addon.id === 'peerflix')
      ?.supportedServices || [];
  const parsedStreams: ParsedStream[] = [];
  const indexerTimeout = peerflixOptions.indexerTimeout
    ? parseInt(peerflixOptions.indexerTimeout)
    : undefined;
  console.log(JSON.stringify(peerflixOptions));
  // If overrideUrl is provided, use it to get streams and skip all other steps
  if (peerflixOptions.overrideUrl) {
    const peerflix = new Peerflix(
      null,
      peerflixOptions.overrideUrl as string,
      peerflixOptions.overrideName,
      addonId,
      config,
      indexerTimeout
    );
    return peerflix.getParsedStreams(streamRequest);
  }

  // find all usable services
  const usableServices = config.services.filter(
    (service) => supportedServices.includes(service.id) && service.enabled
  );
  console.log(
    `|DBG| wrappers > peerflix: Found ${usableServices.length} usable services: ${usableServices.map((service) => service.id).join(', ')}`
  );

  // if no usable services found, use peerflix without any configuration
  if (usableServices.length < 1) {
    const peerflix = new Peerflix(
      null,
      null,
      peerflixOptions.overrideName,
      addonId,
      config,
      indexerTimeout
    );
    return await peerflix.getParsedStreams(streamRequest);
  }

  // otherwise, depending on the configuration, create multiple instances of peerflix or use a single instance with all services

  const getServicePair = (
    serviceId: string,
    credentials: { [key: string]: string }
  ): [string, string] => {
    return serviceId === 'putio'
      ? [serviceId, `${credentials.clientId}@${credentials.token}`]
      : [serviceId, credentials.apiKey];
  };

  if (peerflixOptions.useMultipleInstances === 'true') {
    let retrievedP2PStreams = false;
    const promises = usableServices.map(async (service) => {
      if (!service.enabled) {
        return [];
      }
      console.log(
        `|DBG| wrappers > peerflix: Creating Peerflix instance with service: ${service.id}`
      );
      let configPairs = [getServicePair(service.id, service.credentials)];
      if (peerflixOptions.showP2PStreams === 'true' && !retrievedP2PStreams) {
        configPairs.push(['debridoptions', 'torrentlinks']);
        retrievedP2PStreams = true;
      }
      const configString = configPairs.map((pair) => pair.join('=')).join('|');
      const peerflix = new Peerflix(
        configString,
        null,
        peerflixOptions.overrideName,
        addonId,
        config,
        indexerTimeout
      );
      return await peerflix.getParsedStreams(streamRequest);
    });
    const results = await Promise.all(promises);
    results.forEach((streams) => parsedStreams.push(...streams));
    return parsedStreams;
  } else {
    let configPairs = [];
    for (const service of usableServices) {
      if (!service.enabled) {
        continue;
      }
      configPairs.push(getServicePair(service.id, service.credentials));
    }
    if (peerflixOptions.showP2PStreams === 'true') {
      configPairs.push(['debridoptions', 'torrentlinks']);
    }
    const configString = configPairs.map((pair) => pair.join('=')).join('|');
    const peerflix = new Peerflix(
      configString,
      null,
      peerflixOptions.overrideName,
      addonId,
      config,
      indexerTimeout
    );
    return await peerflix.getParsedStreams(streamRequest);
  }
}
