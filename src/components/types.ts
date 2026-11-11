import type { SupabaseClient } from '@supabase/supabase-js';
import type { Dispatch, SetStateAction } from 'react';
import type { Community } from '../remote/models';

export type AsyncAction = () => void | Promise<void>;
export interface AdministrationProps {
  client: SupabaseClient;
  userId: string;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
}
export interface CommunityAdministrationProps extends AdministrationProps {
  communities: Community[];
  onChanged: AsyncAction;
}
