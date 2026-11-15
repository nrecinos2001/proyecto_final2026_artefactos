import { Controller, MessageEvent, Query, Sse } from '@nestjs/common';
import { Observable, interval, map, merge } from 'rxjs';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * GET /api/events?deviceId=<uuid>
   * Flujo SSE con eventos `status`, `level`, `turbidity`, `alert` y `device`.
   * Cada 25 s se manda un `ping` para mantener viva la conexión.
   */
  @Sse()
  stream(@Query('deviceId') deviceId?: string): Observable<MessageEvent> {
    const live = this.events
      .stream(deviceId)
      .pipe(map((e) => ({ type: e.type, data: e })));
    const ping = interval(25_000).pipe(
      map(() => ({ type: 'ping', data: { t: Date.now() } })),
    );
    return merge(live, ping);
  }
}
