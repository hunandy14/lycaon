import { ROLE_META, type RoleId } from '@lycaon/engine';

/** 依角色類別給主色（狼紅、神金、民綠） */
export function factionColor(role: RoleId): string {
  const meta = ROLE_META[role];
  if (meta.faction === 'wolf') return 'var(--wolf)';
  if (meta.cls === 'god') return 'var(--god)';
  return 'var(--villager)';
}

export function roleShort(role: RoleId): string {
  return ROLE_META[role].short;
}

export function roleName(role: RoleId): string {
  return ROLE_META[role].name;
}
