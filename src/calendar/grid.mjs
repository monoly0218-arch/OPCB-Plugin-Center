import {TYPES, eventsOn} from './model.mjs';
import {dateLabel, monthCells} from '../tasks/calendar.mjs';
import {addDays} from '../tasks/schedule.mjs';

const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const shortDate = date => dateLabel(date).replace(/^\d+年/, '');
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

export function weekDates(day) {
  const offset = (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7;
  return weekdays.map((weekday, index) => ({date: addDays(day, index - offset), weekday}));
}

export function timeOn(event, day) {
  if (event.allDay) return '全天';
  return (day === event.date ? event.time : '00:00') + '–' +
    (day === event.endDate ? event.endTime : '24:00');
}

// Partition overlapping blocks so every event remains selectable.
export function timedBlocks(events, date) {
  const blocks = events.filter(event => !event.allDay).map(event => ({
    event,
    start: date === event.date ? minutes(event.time) : 0,
    end: date === event.endDate ? minutes(event.endTime) : 1440
  })).filter(block => block.end > block.start).sort((a, b) => a.start - b.start || b.end - a.end);

  let group = [], lanes = [], groupEnd = 0;
  const finishGroup = () => group.forEach(block => { block.lanes = lanes.length; });
  for (const block of blocks) {
    const displayEnd = Math.max(block.end, Math.min(1440, block.start + 26));
    if (block.start >= groupEnd) {
      finishGroup();
      group = [];
      lanes = [];
    }
    const free = lanes.findIndex(end => end <= block.start);
    block.lane = free < 0 ? lanes.length : free;
    lanes[block.lane] = displayEnd;
    group.push(block);
    groupEnd = Math.max(groupEnd, displayEnd);
  }
  finishGroup();
  return blocks;
}

export function createCalendarGrid(h) {
  const dateButton = (date, today, selected, onSelect, label, count) => h('button', {
    type: 'button', className: 'cal-date', 'aria-label': dateLabel(date),
    'aria-description': count > 0 ? count + ' 项安排' : undefined,
    'aria-pressed': date === selected, 'aria-current': date === today ? 'date' : undefined,
    onClick: () => onSelect(date)
  }, label, count > 0 && h('span', {className: 'cal-date-count', 'aria-hidden': true}, count));

  const eventButton = (event, date, picked, onOpen, showTime, style) => h('button', {
    key: event.id, type: 'button', className: 'cal-event', style,
    'data-type': event.type, 'aria-pressed': picked === event.id,
    'aria-label': TYPES[event.type] + '：' + event.title,
    title: event.title + ' · ' + timeOn(event, date),
    onClick: () => onOpen(event, date)
  }, showTime && h('span', {className: 'cal-event-time'}, showTime),
    h('span', {className: 'cal-event-title'}, event.title));

  function Month({day, today, events, picked, onSelect, onOpen}) {
    return h('div', {className: 'cal-month', 'aria-label': '月历'},
      ...weekdays.map(weekday => h('span', {className: 'cal-weekday', key: weekday}, weekday)),
      ...monthCells(day.slice(0, 7)).map(cell => {
        const items = eventsOn(events, cell.date);
        return h('section', {className: 'cal-day', key: cell.date,
          'data-outside': !cell.current, 'data-selected': cell.date === day},
          dateButton(cell.date, today, day, onSelect, cell.day, items.length),
          h('div', {className: 'cal-month-events'},
            ...items.slice(0, 2).map(event => eventButton(event, cell.date, picked, onOpen,
              !event.allDay && (event.date === cell.date ? event.time : '续'))),
            items.length > 2 && h('button', {
              type: 'button', className: 'cal-more',
              'aria-label': dateLabel(cell.date) + '全部' + items.length + '项安排',
              onClick: () => onSelect(cell.date, true)
            }, '+' + (items.length - 2) + ' 项')));
      }));
  }

  function Week({day, today, events, picked, onSelect, onOpen}) {
    const columns = weekDates(day).map(cell => {
      const items = eventsOn(events, cell.date);
      return {...cell, allDay: items.filter(event => event.allDay), blocks: timedBlocks(items, cell.date)};
    });
    const blocks = columns.flatMap(cell => cell.blocks);
    const firstHour = Math.min(8, ...blocks.map(block => Math.floor(block.start / 60)));
    const lastHour = Math.max(19, ...blocks.map(block => Math.ceil(block.end / 60)));
    const hours = Array.from({length: lastHour - firstHour}, (_, index) => firstHour + index);
    const percent = value => value / (hours.length * 60) * 100 + '%';

    return h('div', {className: 'cal-week-scroll', tabIndex: 0, role: 'region', 'aria-label': '周历时间轴'},
      h('div', {className: 'cal-week'},
        h('div', {className: 'cal-week-head'},
          h('span', {className: 'cal-week-gutter'}, 'UTC+8'),
          ...columns.map(cell => h('div', {className: 'cal-week-date', key: cell.date, 'data-selected': cell.date === day},
            h('span', null, cell.weekday),
            dateButton(cell.date, today, day, onSelect, Number(cell.date.slice(8))))),
          h('span', {className: 'cal-week-gutter'}, '全天'),
          ...columns.map(cell => h('div', {className: 'cal-week-all-day', key: cell.date, 'data-selected': cell.date === day},
            ...cell.allDay.slice(0, 2).map(event => eventButton(event, cell.date, picked, onOpen)),
            cell.allDay.length > 2 && h('button', {
              type: 'button', className: 'cal-more',
              'aria-label': dateLabel(cell.date) + '全部安排',
              onClick: () => onSelect(cell.date, true)
            }, '+' + (cell.allDay.length - 2) + ' 项')))),
        h('div', {className: 'cal-week-body', style: {'--hour-count': hours.length}},
          h('div', {className: 'cal-hour-labels'},
            ...hours.map(hour => h('span', {key: hour}, String(hour).padStart(2, '0') + ':00'))),
          ...columns.map(cell => h('div', {className: 'cal-time-column', key: cell.date, 'data-selected': cell.date === day},
            ...cell.blocks.map(({event, start, end, lane, lanes}) => eventButton(event, cell.date, picked, onOpen,
              start === 0 ? '00:00' : event.time, {
                top: percent(start - firstHour * 60), height: percent(end - start),
                left: (lane / lanes * 100) + '%', width: (100 / lanes) + '%'
              })))))));
  }

  return {Month, Week};
}

export function rangeTitle(day, mode) {
  if (mode === 'month') return Number(day.slice(5, 7)) + '月';
  const [{date: start}, , , , , , {date: end}] = weekDates(day);
  return shortDate(start) + '–' + (start.slice(0, 7) === end.slice(0, 7) ? Number(end.slice(8)) + '日' : shortDate(end));
}
