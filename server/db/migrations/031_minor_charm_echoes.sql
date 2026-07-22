alter table characters
  add column minor_charm_echoes integer not null default 0
    check (minor_charm_echoes between 0 and 1000000),
  add column max_minor_charm_echoes integer not null default 0
    check (max_minor_charm_echoes between 0 and 1000000),
  add constraint characters_minor_charm_echoes_max_check
    check (minor_charm_echoes <= max_minor_charm_echoes);
