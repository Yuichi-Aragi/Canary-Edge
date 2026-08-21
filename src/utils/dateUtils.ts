import { add, differenceInMinutes, intervalToDuration } from "date-fns";

export function parseDurationToMinutes(duration: string | false | undefined): number {
	if (duration === undefined || duration === false || duration === "") {
		return 0;
	}
	const match = /^(\d+)([mhd])$/.exec(duration.trim().toLowerCase());
	if (match === null) {
		return 0;
	}
	const val = Number(match[1]);
	const unit = match[2];

	const baseDate = new Date(0);
	let targetDate = baseDate;

	if (unit === "m") {
		targetDate = add(baseDate, { minutes: val });
	} else if (unit === "h") {
		targetDate = add(baseDate, { hours: val });
	} else if (unit === "d") {
		targetDate = add(baseDate, { days: val });
	}

	return differenceInMinutes(targetDate, baseDate);
}

export function formatMinutesToDuration(minutes: number): string | false {
	if (minutes <= 0) {
		return false;
	}

	const baseDate = new Date(0);
	const targetDate = add(baseDate, { minutes });
	const duration = intervalToDuration({ start: baseDate, end: targetDate });

	if (minutes % (60 * 24) === 0 && duration.days !== undefined && duration.days > 0) {
		return `${String(duration.days)}d`;
	}
	if (minutes % 60 === 0) {
		const totalHours = Math.floor(minutes / 60);
		return `${String(totalHours)}h`;
	}
	return `${String(minutes)}m`;
}
