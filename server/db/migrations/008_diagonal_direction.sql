alter table characters
  drop constraint characters_direction_check,
  add constraint characters_direction_check check (
    direction in (
      'north', 'east', 'south', 'west',
      'northeast', 'southeast', 'southwest', 'northwest'
    )
  );
