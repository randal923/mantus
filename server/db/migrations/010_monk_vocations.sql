alter table characters
  drop constraint characters_vocation_check,
  add constraint characters_vocation_check check (
    vocation in (
      'Knight', 'Paladin', 'Sorcerer', 'Druid',
      'Elite Knight', 'Royal Paladin', 'Master Sorcerer', 'Elder Druid',
      'Monk', 'Exalted Monk'
    )
  );
