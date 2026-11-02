import { NgModule, SecurityContext } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { NZ_I18N } from 'ng-zorro-antd/i18n';
import { en_US } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import en from '@angular/common/locales/en';
import { FormsModule } from '@angular/forms';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { MarkdownModule } from 'ngx-markdown';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzIconModule } from 'ng-zorro-antd/icon';
import {
  ThunderboltOutline,
  ClockCircleOutline,
  DatabaseOutline,
  ApartmentOutline,
  CodeOutline,
  ClusterOutline,
  FormOutline,
  BranchesOutline,
  ShareAltOutline,
  ApiOutline,
  GlobalOutline,
  ExperimentOutline,
  LineChartOutline,
  DeploymentUnitOutline,
  SyncOutline,
  SendOutline,
  PlusOutline,
  MinusOutline,
  FireOutline,
  ToolOutline,
  ReloadOutline,
  SafetyOutline,
  SafetyCertificateOutline,
  SkinOutline,
  AppstoreOutline,
  HighlightOutline,
  TagOutline,
  FontSizeOutline,
  BookOutline,
  CustomerServiceOutline,
  AudioOutline,
  ReadOutline,
  UserOutline,
  LockOutline,
  EyeOutline,
  EyeInvisibleOutline,
  LogoutOutline,
  EditOutline,
  DeleteOutline,
  FolderOutline,
  FolderAddOutline,
  SearchOutline,
  CheckOutline,
  CloseOutline,
  SoundOutline,
  StarOutline,
  ThunderboltFill,
  HomeOutline,
  CheckCircleOutline,
  RightOutline,
  LeftOutline,
  BookFill,
  FireFill,
  SwapOutline,
  UnorderedListOutline,
  AppstoreAddOutline,
  CloseCircleOutline,
  LoginOutline,
  PlayCircleOutline,
  PauseCircleOutline,
  AudioMutedOutline,
  StepForwardOutline,
  StepBackwardOutline,
  TranslationOutline,
  FullscreenOutline,
  EnvironmentOutline,
  AimOutline,
  MessageOutline,
  BulbOutline,
  UndoOutline,
  RedoOutline,
  FullscreenExitOutline,
} from '@ant-design/icons-angular/icons';
import { NzImageModule } from 'ng-zorro-antd/image';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ShellComponent } from './layout/shell/shell.component';
import { MarkdownDocComponent } from './base/components/markdown-doc/markdown-doc.component';
import { IndicatorsTableComponent } from './features/change-detection/components/indicators-table.component';
import { IndicatorRowDefaultComponent } from './features/change-detection/components/cd-default/indicator-row-default.component';
import { IndicatorRowOnpushComponent } from './features/change-detection/components/cd-onpush/indicator-row-onpush.component';
import { IndicatorRowOnpushPipeComponent } from './features/change-detection/components/cd-onpush-pipe/indicator-row-onpush-pipe.component';
import { FpsMeterComponent } from './base/components/fps-meter/fps-meter.component';
import { RiskScorePipe } from './features/change-detection/pipes/risk-score.pipe';
import { ClusterDemoComponent } from './features/system-design/cluster/cluster-demo.component';
import { ClusterTheoryComponent } from './features/system-design/cluster/cluster-theory.component';
import { LoadParameterDemoComponent } from './features/system-design/load-parameter/load-parameter-demo.component';
import { IdempotencyDemoComponent } from './features/system-design/idempotency/idempotency-demo.component';
import { StorageIoDemoComponent } from './features/database/storage-io/storage-io-demo.component';
import { IndexDemoComponent } from './features/database/index/index-demo.component';
import { ExecutionPlanDemoComponent } from './features/database/execution-plan/execution-plan-demo.component';
import { TransactionDemoComponent } from './features/database/transactions/transaction-demo.component';
import { OutboxFlowDemoComponent } from './features/database/transactions/outbox-flow-demo.component';
import { IsolationAnomaliesDemoComponent } from './features/database/isolation-anomalies/isolation-anomalies-demo.component';
import { StepHistoryComponent } from './features/database/shared/step-history/step-history.component';
import { AdvancedSqlDemoComponent } from './features/database/advanced-sql/advanced-sql-demo.component';
import { HomeComponent } from './features/home/home.component';
import { EnglishFeatureComponent } from './features/english/english-feature.component';
import { EnglishSkillComponent } from './features/english/english-skill.component';
import { LessonPlayerComponent } from './features/english/lesson-player.component';
import { EnglishReviewComponent } from './features/english/english-review.component';
import { SpeakingLessonComponent } from './features/english/speaking-lesson.component';
import { WordGardenComponent } from './features/english/word-garden.component';
import { ContentEditorComponent } from './features/admin/content-editor.component';
import { LoginComponent } from './features/auth/login.component';
import { VideoLessonComponent } from './features/english/video-lesson.component';
import { VideoLibraryComponent } from './features/english/video-library.component';
import { DialogueLessonComponent } from './features/english/dialogue-lesson.component';
import { SpeakingRouterComponent } from './features/english/speaking-router.component';
import { authInterceptor } from './core/auth.interceptor';
import {
  LearningProfileStore,
  LocalStorageLearningProfileStore,
} from './core/learning-profile.service';

registerLocaleData(en);

@NgModule({
  declarations: [
    AppComponent,
    ShellComponent,
    MarkdownDocComponent,
    IndicatorsTableComponent,
    IndicatorRowDefaultComponent,
    IndicatorRowOnpushComponent,
    IndicatorRowOnpushPipeComponent,
    FpsMeterComponent,
    RiskScorePipe,
    ClusterDemoComponent,
    ClusterTheoryComponent,
    LoadParameterDemoComponent,
    IdempotencyDemoComponent,
    StorageIoDemoComponent,
    IndexDemoComponent,
    ExecutionPlanDemoComponent,
    TransactionDemoComponent,
    OutboxFlowDemoComponent,
    IsolationAnomaliesDemoComponent,
    StepHistoryComponent,
    AdvancedSqlDemoComponent,
    HomeComponent,
    EnglishFeatureComponent,
    EnglishSkillComponent,
    LessonPlayerComponent,
    EnglishReviewComponent,
    SpeakingLessonComponent,
    WordGardenComponent,
    ContentEditorComponent,
    LoginComponent,
    VideoLessonComponent,
    VideoLibraryComponent,
    DialogueLessonComponent,
    SpeakingRouterComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzCheckboxModule,
    NzIconModule.forRoot([
      ThunderboltOutline,
      ClockCircleOutline,
      DatabaseOutline,
      ApartmentOutline,
      CodeOutline,
      ClusterOutline,
      FormOutline,
      BranchesOutline,
      ShareAltOutline,
      ApiOutline,
      GlobalOutline,
      ExperimentOutline,
      LineChartOutline,
      DeploymentUnitOutline,
      SyncOutline,
      SendOutline,
      PlusOutline,
      MinusOutline,
      FireOutline,
      ToolOutline,
      ReloadOutline,
      SafetyOutline,
      SafetyCertificateOutline,
      SkinOutline,
      AppstoreOutline,
      HighlightOutline,
      TagOutline,
      FontSizeOutline,
      BookOutline,
      CustomerServiceOutline,
      AudioOutline,
      ReadOutline,
      UserOutline,
      LockOutline,
      EyeOutline,
      EyeInvisibleOutline,
      LogoutOutline,
      EditOutline,
      DeleteOutline,
      FolderOutline,
      FolderAddOutline,
      SearchOutline,
      CheckOutline,
      CloseOutline,
      SoundOutline,
      StarOutline,
      ThunderboltFill,
      HomeOutline,
      CheckCircleOutline,
      RightOutline,
      LeftOutline,
      BookFill,
      FireFill,
      SwapOutline,
      UnorderedListOutline,
      AppstoreAddOutline,
      CloseCircleOutline,
      LoginOutline,
      PlayCircleOutline,
      PauseCircleOutline,
      AudioMutedOutline,
      StepForwardOutline,
      StepBackwardOutline,
      TranslationOutline,
      FullscreenOutline,
      EnvironmentOutline,
      AimOutline,
      MessageOutline,
      BulbOutline,
      UndoOutline,
      RedoOutline,
      FullscreenExitOutline,
    ]),
    NzImageModule,
    NzInputNumberModule,
    NzLayoutModule,
    NzMenuModule,
    NzRadioModule,
    NzSelectModule,
    NzTableModule,
    NzTagModule,
    MarkdownModule.forRoot({
      loader: HttpClient,
      sanitize: SecurityContext.NONE,
    }),
  ],
  providers: [
    { provide: NZ_I18N, useValue: en_US },
    { provide: LearningProfileStore, useClass: LocalStorageLearningProfileStore },
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
