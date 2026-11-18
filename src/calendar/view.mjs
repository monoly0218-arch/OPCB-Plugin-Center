import {TYPES, eventsOn, canEditEvent} from './model.mjs';
import {dateLabel, shiftMonth} from '../tasks/calendar.mjs';
import {addDays} from '../tasks/schedule.mjs';
import {createPersonCard} from '../tasks/company-person-card.mjs';
import {companyTasks, companyGroups} from '../tasks/company-model.mjs';
import {createCalendarGrid, rangeTitle, timeOn} from './grid.mjs';

const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

export function createCalendarView(React) {
  const h = React.createElement;
  const PersonCard = createPersonCard(React);
  const {Month, Week} = createCalendarGrid(h);
  const button = (label, onClick, props = {}) => h('button', {type: 'button', onClick, ...props}, label);
  const typeOptions = () => Object.entries(TYPES).map(([id, label]) => h('option', {key: id, value: id}, label));

  return function CalendarView({state, people = {}, media, reload, onSave, viewer, creator}) {
    const [page, setPage] = React.useState('calendar');
    const [mode, setMode] = React.useState('month');
    const [day, setDay] = React.useState(today);
    const [type, setType] = React.useState('');
    const [person, setPerson] = React.useState('');
    const [query, setQuery] = React.useState('');
    const [peopleQuery, setPeopleQuery] = React.useState('');
    const [draft, setDraft] = React.useState(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');
    const [notice, setNotice] = React.useState('');
    const [picked, setPicked] = React.useState(null);
    const [confirmRemove, setConfirmRemove] = React.useState(false);
    const lock = React.useRef(false);
    const panelHeading = React.useRef(null);
    const draftTrigger = React.useRef(null);

    const currentDate = today();
    const data = state.error ? null : state.data;
    const events = data?.events || [];
    const groups = companyGroups(companyTasks(data), 'people');
    const needle = query.trim().toLowerCase();
    const filtered = events.filter(event =>
      (!type || event.type === type) &&
      (!person || event.participants.includes(person)) &&
      (!needle || [event.title, event.location, ...event.participants].join(' ').toLowerCase().includes(needle)));
    const selected = events.find(event => event.id === picked);
    const agenda = eventsOn(filtered, day);
    const names = [...new Set([...groups.map(group => group.name), ...events.flatMap(event => event.participants)])];

    const focusPanel = () => requestAnimationFrame(() => panelHeading.current?.focus());
    const selectDate = (date, reveal = false) => {
      setDay(date);
      setPicked(null);
      if (reveal) focusPanel();
    };
    const openEvent = (event, date) => {
      if (draft) return;
      setDay(date);
      setPicked(event.id);
      focusPanel();
    };
    const choosePage = next => {
      if (next === page) return;
      setPage(next);
      setPicked(null);
    };
    const move = step => selectDate(mode === 'month'
      ? shiftMonth(day.slice(0, 7), step) + '-01'
      : addDays(day, step * 7));

    const openDraft = (value, trigger) => {
      draftTrigger.current = trigger;
      setDraft(value);
      setError('');
      setNotice('');
      setConfirmRemove(false);
      focusPanel();
    };
    const closeDraft = () => {
      setDraft(null);
      setError('');
      setConfirmRemove(false);
      requestAnimationFrame(() => {
        if (draftTrigger.current?.isConnected) draftTrigger.current.focus();
        else panelHeading.current?.focus();
      });
    };
    const add = event => openDraft({
      id: globalThis.crypto.randomUUID().replaceAll('-', '') + globalThis.crypto.randomUUID().replaceAll('-', ''),
      type: 'online', title: '', date: day, endDate: day, allDay: true,
      time: '09:30', endTime: '10:30', participants: [], location: '', note: ''
    }, event.currentTarget);
    const change = (field, value) => setDraft(previous => ({
      ...previous, [field]: value,
      ...(field === 'date' && (!previous.endDate || previous.endDate < value) ? {endDate: value} : {})
    }));
    const editing = !!draft?.createdBy;
    const save = async action => {
      if (lock.current || !onSave) return;
      lock.current = true;
      setBusy(true);
      setError('');
      try {
        await onSave({action, event: draft, id: draft.id});
        if (action !== 'remove') setDay(draft.date);
        setPicked(action === 'remove' ? null : draft.id);
        closeDraft();
        setNotice(action === 'remove' ? '日程已删除' : '日程已保存');
      } catch (failure) {
        setError(failure.message);
      } finally {
        lock.current = false;
        setBusy(false);
      }
    };

    const editor = draft && h('section', {className: 'cal-editor', 'aria-label': '编辑日程'},
      h('h2', {tabIndex: -1, ref: panelHeading}, editing ? '编辑日程' : '新增日程'),
      h('form', {onSubmit: event => { event.preventDefault(); void save(editing ? 'update' : 'add'); }},
        h('div', {className: 'cal-fields'},
          h('label', null, '日程名称',
            h('input', {required: true, maxLength: 60, value: draft.title, onChange: e => change('title', e.target.value)})),
          h('label', null, '类型',
            h('select', {value: draft.type, onChange: e => change('type', e.target.value)}, ...typeOptions())),
          h('div', {className: 'cal-field-pair'},
            h('label', null, '开始日期',
              h('input', {type: 'date', required: true, value: draft.date, onChange: e => change('date', e.target.value)})),
            h('label', null, '结束日期',
              h('input', {type: 'date', required: true, min: draft.date, value: draft.endDate, onChange: e => change('endDate', e.target.value)}))),
          h('label', {className: 'cal-checkbox'},
            h('input', {type: 'checkbox', checked: draft.allDay, onChange: e => change('allDay', e.target.checked)}), '全天'),
          !draft.allDay && h('div', {className: 'cal-field-pair'},
            h('label', null, '开始时间',
              h('input', {type: 'time', required: true, value: draft.time, onChange: e => change('time', e.target.value)})),
            h('label', null, '结束时间',
              h('input', {type: 'time', required: true, value: draft.endTime, onChange: e => change('endTime', e.target.value)}))),
          h('label', null, '地点或会议链接',
            h('input', {maxLength: 300, value: draft.location, onChange: e => change('location', e.target.value)}))),
        names.length > 0 && h('fieldset', null, h('legend', null, '参与人员'),
          ...names.map(name => h('label', {key: name, className: 'cal-checkbox'},
            h('input', {type: 'checkbox', checked: draft.participants.includes(name),
              onChange: e => change('participants', e.target.checked
                ? [...draft.participants, name] : draft.participants.filter(value => value !== name))}), name))),
        h('label', {className: 'cal-note'}, '备注',
          h('textarea', {value: draft.note, maxLength: 1000, onChange: e => change('note', e.target.value)})),
        draft.type === 'leave' && h('p', null, '请假审批仍按公司流程'),
        error && h('p', {role: 'alert'}, error),
        h('div', {className: 'cal-actions'},
          h('button', {type: 'submit', disabled: busy || !onSave, className: 'cal-primary'}, busy ? '正在保存…' : '保存日程'),
          button('取消', closeDraft, {disabled: busy}),
          editing && button(confirmRemove ? '确认删除' : '删除日程',
            () => confirmRemove ? void save('remove') : setConfirmRemove(true), {disabled: busy || !onSave, className: 'cal-delete'}))));

    const detail = selected && h('section', {className: 'cal-detail', 'aria-label': '日程详情'},
      button('‹ 当天安排', () => { setPicked(null); focusPanel(); }, {className: 'cal-back'}),
      h('span', {className: 'cal-type', 'data-type': selected.type}, TYPES[selected.type]),
      h('h2', {tabIndex: -1, ref: panelHeading}, selected.title),
      h('dl', null,
        h('dt', null, '日期'), h('dd', null, dateLabel(selected.date) +
          (selected.endDate === selected.date ? '' : ' 至 ' + dateLabel(selected.endDate))),
        h('dt', null, '时间'), h('dd', null, selected.allDay ? '全天' : selected.time + '–' + selected.endTime +
          (selected.endDate === selected.date ? '' : '（跨天）')),
        h('dt', null, '人员'), h('dd', null, selected.participants.join('、') || '未登记'),
        selected.location && h(React.Fragment, null, h('dt', null, '地点'), h('dd', null, selected.location)),
        selected.note && h(React.Fragment, null, h('dt', null, '备注'), h('dd', {className: 'cal-detail-note'}, selected.note))),
      selected.type === 'leave' && h('p', null, '请假审批仍按公司流程'),
      canEditEvent(selected, viewer, creator) && button('编辑日程',
        event => openDraft({...selected}, event.currentTarget), {disabled: !onSave}));

    const agendaPanel = h('section', {className: 'cal-agenda', 'aria-label': '当日日程'},
      h('header', null,
        h('h2', {tabIndex: -1, ref: panelHeading}, dateLabel(day).replace(/^\d+年/, '')),
        h('span', null, day === currentDate ? '今天 · ' + agenda.length + ' 项安排' : agenda.length + ' 项安排')),
      agenda.length > 0
        ? h('ul', null, ...agenda.map(event => h('li', {key: event.id},
          h('button', {type: 'button', className: 'cal-agenda-event', 'data-type': event.type,
            onClick: () => openEvent(event, day), 'aria-label': TYPES[event.type] + '：' + event.title},
          h('span', {className: 'cal-agenda-meta'}, h('span', {className: 'cal-type'}, TYPES[event.type]), timeOn(event, day)),
          h('strong', null, event.title),
          event.participants.length > 0 && h('span', {className: 'cal-agenda-people'}, event.participants.join('、'))))))
        : h('p', {className: 'cal-agenda-empty'}, type || person || needle ? '没有符合筛选的安排' : '当天暂无安排'));

    return h('section', {className: 'opcb-calendar company-workbench',
      onKeyDown: event => {
        if (event.key !== 'Escape' || page !== 'calendar') return;
        if (draft && !lock.current) { event.stopPropagation(); closeDraft(); }
        else if (!draft && picked) { event.stopPropagation(); setPicked(null); focusPanel(); }
      }},
      h('style', null, OPCB_CALENDAR_CSS),
      h('header', {className: 'cal-header'},
        h('nav', {'aria-label': '视图'},
          button('日历', () => choosePage('calendar'), {'aria-current': page === 'calendar' ? 'page' : undefined}),
          button('人员卡片', () => choosePage('people'), {'aria-current': page === 'people' ? 'page' : undefined})),
        h('div', {className: 'cal-actions'},
          button('刷新', reload, {disabled: state.loading || busy}),
          page === 'calendar' && button('＋ 新增日程', add, {
            'aria-label': '新增日程', disabled: !onSave || !!draft, className: 'cal-primary'
          }))),
      state.loading && h('p', {role: 'status', className: 'cal-feedback'}, '正在核对共享来源…'),
      state.error && h('p', {role: 'alert', className: 'cal-feedback'}, state.error),
      notice && h('p', {role: 'status', className: 'cal-feedback'}, notice),
      page === 'people'
        ? h('main', {className: 'cal-people'},
          h('input', {'aria-label': '搜索人员', placeholder: '搜索人员', value: peopleQuery, onChange: e => setPeopleQuery(e.target.value)}),
          h('div', {className: 'cb-people-grid'}, ...groups.filter(group => group.name.toLowerCase().includes(peopleQuery.trim().toLowerCase()))
            .map(group => h(PersonCard, {key: group.name, group, identity: people[group.name], media,
              onOpen: () => { setPerson(group.name); setQuery(''); choosePage('calendar'); }}))),
          !groups.length && h('p', null, '当前来源暂无人员分工'))
        : h('main', {className: 'cal-workspace'},
          h('section', {className: 'cal-board', 'aria-label': '共享日历'},
            h('header', {className: 'cal-board-header'},
              h('div', null, h('span', {className: 'cal-year'}, day.slice(0, 4) + '年'),
                h('h1', {'aria-live': 'polite'}, rangeTitle(day, mode))),
              h('div', {className: 'cal-actions'},
                h('div', {className: 'cal-segment', role: 'group', 'aria-label': '日历范围'},
                  button('月', () => setMode('month'), {'aria-pressed': mode === 'month'}),
                  button('周', () => setMode('week'), {'aria-pressed': mode === 'week'})),
                button('今天', () => selectDate(currentDate)),
                h('div', {className: 'cal-arrows'},
                  button('‹', () => move(-1), {'aria-label': mode === 'month' ? '上个月' : '上一周'}),
                  button('›', () => move(1), {'aria-label': mode === 'month' ? '下个月' : '下一周'})))),
            h('div', {className: 'cal-filters'},
              h('input', {'aria-label': '搜索日程', placeholder: '搜索日程', value: query, onChange: e => { setQuery(e.target.value); setPicked(null); }}),
              h('select', {'aria-label': '日程类型', value: type, onChange: e => { setType(e.target.value); setPicked(null); }},
                h('option', {value: ''}, '全部类型'), ...typeOptions()),
              h('select', {'aria-label': '参与人员', value: person, onChange: e => { setPerson(e.target.value); setPicked(null); }},
                h('option', {value: ''}, '全部人员'), ...names.map(name => h('option', {key: name, value: name}, name)))),
            h(mode === 'month' ? Month : Week, {day, today: currentDate, events: filtered, picked, onSelect: selectDate, onOpen: openEvent})),
          h('aside', {className: 'cal-side', 'aria-label': '日程面板'}, editor || detail || agendaPanel)));
  };
}
