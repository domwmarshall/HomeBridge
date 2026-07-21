import { supabase } from './supabase';
import { PickedPhoto } from '../types';

const BUCKET = 'household-private';

function extensionFor(photo: PickedPhoto): string {
  const fromName = photo.fileName?.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (photo.mimeType?.includes('png')) return 'png';
  if (photo.mimeType?.includes('webp')) return 'webp';
  return 'jpg';
}

function mimeFor(photo: PickedPhoto): string {
  return photo.mimeType || (extensionFor(photo) === 'png' ? 'image/png' : 'image/jpeg');
}

export async function uploadPrivatePhoto(
  householdId: string,
  folder: 'items' | 'medical' | 'calendar',
  photo: PickedPhoto,
): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const extension = extensionFor(photo);
  const random = Math.random().toString(36).slice(2, 10);
  const path = `${householdId}/${folder}/${Date.now()}-${random}.${extension}`;
  const response = await fetch(photo.uri);
  if (!response.ok) throw new Error('The selected picture could not be read.');
  const bytes = await response.arrayBuffer();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mimeFor(photo),
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function deletePrivatePhoto(path?: string): Promise<void> {
  if (!path || !supabase) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function signedPhotoUrl(path?: string): Promise<string | undefined> {
  if (!path || !supabase) return undefined;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
  if (error) return undefined;
  return data.signedUrl;
}
