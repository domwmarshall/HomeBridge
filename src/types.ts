export type TabKey = 'today' | 'calendar' | 'things' | 'handover' | 'child';

export type ParentLabel = 'Dad' | 'Mum';
export type ResponsibleParent = ParentLabel | 'Both';

export type HouseholdLocation =
  | "Dad's house"
  | "Mum's house"
  | 'School'
  | 'School bag'
  | 'Handover bag'
  | 'In transit'
  | 'Missing'
  | 'Outgrown';

export type HomeLocation = "Dad's house" | "Mum's house";

export type ItemCategory =
  | 'Uniform'
  | 'Clothing'
  | 'Toy'
  | 'School'
  | 'Medical'
  | 'Other';

export type EventCategory =
  | 'School'
  | 'Handover'
  | 'Party'
  | 'Trip'
  | 'Medical'
  | 'Holiday'
  | 'Reminder';

export type SyncState = 'local' | 'connecting' | 'synced' | 'offline' | 'error';

export interface PickedPhoto {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  width?: number;
  height?: number;
}

export interface PendingInvite {
  id: string;
  parentLabel?: ParentLabel;
  expiresAt: string;
  createdAt: string;
}

export interface HouseholdMember {
  userId: string;
  displayName: string;
  parentLabel?: string;
  role: 'owner' | 'parent' | 'guardian' | 'viewer';
}

export interface Workspace {
  householdId: string;
  householdName: string;
  childId: string;
  userId: string;
  displayName: string;
  parentLabel?: ParentLabel;
  role: HouseholdMember['role'];
  members: HouseholdMember[];
  pendingInvites: PendingInvite[];
  createInvite: (parentLabel: ParentLabel) => Promise<string>;
  revokeInvite: (inviteId: string) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
}

export interface ChildProfile {
  id: string;
  name: string;
  initials: string;
  school: string;
  className: string;
  currentHousehold: HomeLocation;
  nextHandoverAt: string;
  nextHandoverTo: ParentLabel;
  collectionPlan: string;
  allergies: string[];
  clothingSize: string;
  shoeSize: string;
}

export interface CareScheduleRule {
  id: string;
  title: string;
  startsOn: string;
  householdLabel: HomeLocation;
  pickupParentLabel?: ParentLabel;
  pickupLocation?: string;
  recurrenceRule: string;
}

export interface CareOverride {
  id: string;
  startsOn: string;
  endsOn: string;
  householdLabel: HomeLocation;
  note?: string;
}

export interface CareOverrideInput {
  startsOn: string;
  endsOn: string;
  householdLabel: HomeLocation;
  note?: string;
}

export interface CareScheduleInput {
  startsOn: string;
  householdLabel: HomeLocation;
  pickupParentLabel: ParentLabel;
  pickupLocation: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  category: EventCategory;
  responsibleParent: ResponsibleParent;
  location?: string;
  acknowledged: boolean;
  notes?: string;
  allDay: boolean;
  rsvpDeadline?: string;
  requiredItemIds: string[];
  photoPath?: string;
  photoUrl?: string;
}

export interface TrackedItem {
  id: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  location: HouseholdLocation;
  neededAt?: HouseholdLocation;
  photoPath?: string;
  photoUrl?: string;
  minimumAtDad?: number;
  minimumAtMum?: number;
  notes?: string;
}

export interface HandoverTask {
  id: string;
  label: string;
  itemId?: string;
  done: boolean;
  essential?: boolean;
}

export interface MedicalItem {
  id: string;
  name: string;
  location: HouseholdLocation;
  expiryDate: string;
  quantity: number;
  lastCheckedAt: string;
  replacementStatus: 'OK' | 'Due soon' | 'Requested' | 'Replaced';
  photoPath?: string;
  photoUrl?: string;
  notes?: string;
}

export interface AppState {
  child: ChildProfile;
  events: CalendarEvent[];
  items: TrackedItem[];
  handoverTasks: HandoverTask[];
  medicalItems: MedicalItem[];
  careScheduleRules: CareScheduleRule[];
  careOverrides: CareOverride[];
  handoverNote: string;
  activeHandoverId?: string;
}

export type NewCalendarEvent = Omit<CalendarEvent, 'id' | 'acknowledged' | 'photoPath' | 'photoUrl'> & {
  photo?: PickedPhoto;
};

export type EditableCalendarEvent = Omit<CalendarEvent, 'acknowledged' | 'photoUrl'> & {
  photo?: PickedPhoto;
};

export interface ItemInput {
  name: string;
  category: ItemCategory;
  quantity: number;
  location: HouseholdLocation;
  neededAt?: HouseholdLocation;
  minimumAtDad?: number;
  minimumAtMum?: number;
  notes?: string;
  photo?: PickedPhoto;
}

export interface MedicalItemInput {
  name: string;
  location: HouseholdLocation;
  expiryDate: string;
  quantity: number;
  replacementStatus: MedicalItem['replacementStatus'];
  notes?: string;
  photo?: PickedPhoto;
}

export interface ChildProfileInput {
  name: string;
  school: string;
  className: string;
  allergies: string[];
  clothingSize: string;
  shoeSize: string;
}
