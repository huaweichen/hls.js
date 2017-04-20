/**
 * AAC demuxer
 */
import ADTS from './adts';
import {logger} from '../utils/logger';
import ID3 from '../demux/id3';

 class AACDemuxer {

  constructor(observer, remuxer, config) {
    this.observer = observer;
    this.config = config;
    this.remuxer = remuxer;
  }

  resetInitSegment(initSegment,audioCodec,videoCodec, duration) {
    this._audioTrack = {container : 'audio/adts', type: 'audio', id :-1, sequenceNumber: 0, isAAC : true , samples : [], len : 0, manifestCodec : audioCodec, duration : duration, inputTimeScale : 90000};
  }

  resetTimeStamp() {
  }

  static probe(data) {
    // check if data contains ID3 timestamp and ADTS sync word
    var id3 = new ID3(data);
    if(id3.hasTimeStamp) {
      // look for ADTS header (0xFFFx)
      var offset = id3.length;
      // Layer bits (position 14 and 15) in header should be always 0 for ADTS
      // More info https://wiki.multimedia.cx/index.php?title=ADTS
      if ((data[offset] === 0xff) && (data[offset+1] & 0xf0) === 0xf0 && (data[offset+1] & 0x06) >> 1 === 0x00) {
        //logger.log('ADTS sync word found !');
        return true;
      }
    }
    return false;
  }


  // feed incoming data to the front of the parsing pipeline
  append(data, timeOffset, contiguous,accurateTimeOffset) {
    var track,
        id3 = new ID3(data),
        pts = 90*id3.timeStamp,
        offset = id3.length,
        len = data.length,
        config, frameLength, frameDuration, frameIndex, headerLength, stamp, aacSample;

    track = this._audioTrack;

    if (!track.samplerate) {
      config = ADTS.getAudioConfig(this.observer,data, offset, track.manifestCodec);
      track.config = config.config;
      track.samplerate = config.samplerate;
      track.channelCount = config.channelCount;
      track.codec = config.codec;
      logger.log(`parsed codec:${track.codec},rate:${config.samplerate},nb channel:${config.channelCount}`);
    }
    frameIndex = 0;
    frameDuration = 1024 * 90000 / track.samplerate;
    while ((offset + 5) < len) {
      // The protection skip bit tells us if we have 2 bytes of CRC data at the end of the ADTS header
      headerLength = (!!(data[offset + 1] & 0x01) ? 7 : 9);
      // retrieve frame size
      frameLength = ((data[offset + 3] & 0x03) << 11) |
                     (data[offset + 4] << 3) |
                    ((data[offset + 5] & 0xE0) >>> 5);
      frameLength  -= headerLength;
      //stamp = pes.pts;

      if ((frameLength > 0) && ((offset + headerLength + frameLength) <= len)) {
        stamp = pts + frameIndex * frameDuration;
        //logger.log(`AAC frame, offset/length/total/pts:${offset+headerLength}/${frameLength}/${data.byteLength}/${(stamp/90).toFixed(0)}`);
        aacSample = {unit: data.subarray(offset + headerLength, offset + headerLength + frameLength), pts: stamp, dts: stamp};
        track.samples.push(aacSample);
        track.len += frameLength;
        offset += frameLength + headerLength;
        frameIndex++;
        // look for ADTS header (0xFFFx)
        for ( ; offset < (len - 1); offset++) {
          if ((data[offset] === 0xff) && ((data[offset + 1] & 0xf0) === 0xf0)) {
            break;
          }
        }
      } else {
        break;
      }
    }
    this.remuxer.remux(track,
                        {samples : []},
                        {samples : [ { pts: pts, dts : pts, unit : id3.payload}], inputTimeScale : 90000},
                        {samples : []},
                        timeOffset,
                        contiguous,
                        accurateTimeOffset);
  }

  destroy() {
  }

}

export default AACDemuxer;
