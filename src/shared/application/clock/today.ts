import type { Clock } from '../../domain/ports/clock.port';
import { formatLimaDate } from '../../domain/time/lima-time';

/** The Lima calendar day of the clock. */
export const todayOf = (clock: Clock): string => formatLimaDate(clock.now());
