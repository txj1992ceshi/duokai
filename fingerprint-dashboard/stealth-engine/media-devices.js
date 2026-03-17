/**
 * media-devices.js
 * 
 * Mocks navigator.mediaDevices.enumerateDevices and getUserMedia 
 * to prevent real hardware ID leakage.
 */

function buildMediaDevicesScript(seed) {
  return `
(function() {
  const devices = [
    { kind: 'audioinput', label: 'Internal Microphone', deviceId: 'default', groupId: 'group1' },
    { kind: 'videoinput', label: 'FaceTime HD Camera', deviceId: 'cam1', groupId: 'group2' },
    { kind: 'audiooutput', label: 'Internal Speakers', deviceId: 'speaker1', groupId: 'group1' }
  ];

  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    const originalEnumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = async () => {
      return devices.map(d => ({
        ...d,
        deviceId: d.deviceId + '_' + (${seed} % 1000)
      }));
    };
  }

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      console.log('[Stealth] getUserMedia blocked/mocked');
      throw new Error('Permission denied');
    };
  }

  console.debug('[Stealth] Media devices injection complete.');
})();
  `;
}

module.exports = { buildMediaDevicesScript };
