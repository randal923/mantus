# Parties, guilds, houses, and social systems

These features depend on stable character ids, chat, combat/PVP policy, and the
atomic item/economy core. Implement independently in small migrations and state
machines rather than one large social subsystem.

Every pinned Canary party, guild/war, PVP/skull, house/auction/rent, VIP group,
highscore, report, and moderation behavior remains required even though the
work is split into separate units.

Split into one-session units; they are largely independent, but 14c builds on
14a/14b state:

1. [Parties](14a-parties.md)
2. [Guilds](14b-guilds.md)
3. [PVP policy](14c-pvp-policy.md)
4. [Houses](14d-houses.md)
5. [VIP, highscores, mail, and moderation](14e-social-services.md)

[Back to overview](README.md)
