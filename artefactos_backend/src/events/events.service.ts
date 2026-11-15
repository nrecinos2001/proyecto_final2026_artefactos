import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter } from 'rxjs';

export type LiveEventType =
  'status' | 'level' | 'turbidity' | 'alert' | 'device';

export interface LiveEvent {
  type: LiveEventType;
  deviceId: string;
  data: unknown;
}

/** Bus interno de eventos que se reenvían al navegador por Server-Sent Events */
@Injectable()
export class EventsService {
  private readonly subject = new Subject<LiveEvent>();

  emit(event: LiveEvent) {
    this.subject.next(event);
  }

  stream(deviceId?: string): Observable<LiveEvent> {
    return this.subject
      .asObservable()
      .pipe(filter((e) => !deviceId || e.deviceId === deviceId));
  }
}
