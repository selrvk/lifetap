import NfcManager, { NfcTech, Ndef, NfcAHandler } from 'react-native-nfc-manager';

// Call once at app startup in App.tsx
export async function initNfc(): Promise<boolean> {
  try {
    const supported = await NfcManager.isSupported();
    if (supported) await NfcManager.start();
    return supported;
  } catch {
    return false;
  }
}

// read
export async function readNfcTag(): Promise<Record<string, any> | null> {
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();

    if (!tag?.ndefMessage?.length) return null;

    const bytes = tag.ndefMessage[0].payload;
    // NDEF text records have a language prefix — strip it
    const text = Ndef.text.decodePayload(bytes as unknown as Uint8Array);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('UNRECOGNIZED_TAG');
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'UNRECOGNIZED_TAG') throw e;
    console.error('readNfcTag error:', e);
    return null;
  } finally {
    NfcManager.cancelTechnologyRequest();
  }
}

//write
export async function writeNfcTag(data: Record<string, any>): Promise<boolean> {
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);

    const json = JSON.stringify(data);
    console.log('Payload size (bytes):', new Blob([json]).size);
    console.log('Payload:', json);

    const bytes = Ndef.encodeMessage([
      Ndef.textRecord(json),
    ]);

    console.log('Encoded bytes length:', bytes?.length);

    if (bytes) {
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
    }

    return true;
  } catch (e: any) {
    console.error('writeNfcTag error name:', e?.name);
    console.error('writeNfcTag error message:', e?.message);
    console.error('writeNfcTag error code:', e?.code);
    console.error('writeNfcTag full error:', JSON.stringify(e));
    return false;
  } finally {
    NfcManager.cancelTechnologyRequest();
  }
}

// cancel
export async function cancelNfc(): Promise<void> {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {}
}