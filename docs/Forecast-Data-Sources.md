# Forecast Data Sources

This document provides detailed information about the environmental data sources integrated into the Rahat Anticipatory Action platform, including their APIs, data processing, and usage patterns.

## Overview

The platform integrates multiple environmental data sources to provide comprehensive climate monitoring and forecasting capabilities. These sources enable automated trigger activation based on real-time environmental conditions.

## 1. Department of Hydrology and Meteorology (DHM)

### Purpose
DHM provides real-time hydrological data for river monitoring and flood prediction in Nepal. This service is critical for early warning systems in flood-prone regions.

### API Integration

#### Base Configuration
```typescript
// Configuration in settings
DATASOURCE: {
  DHM: {
    location: 'Babai at Chepang', // or 'Karnali at Chisapani'
    url: 'https://bipadportal.gov.np/api/v1'
  }
}
```

#### Data Synchronization
- **Frequency**: Every 5 minutes
- **Method**: Automated cron job (`@Cron('*/5 * * * *')`)
- **Process**: Fetches latest water level data and stores in local database

#### API Endpoints Used

##### River Station Data
```typescript
// GET /api/v1/water-levels
// Returns: Array of water level readings with timestamps
{
  "data": {
    "results": [
      {
        "station": "Babai at Chepang",
        "waterLevel": 2.45,
        "timestamp": "2024-01-15T10:30:00Z",
        "location": "coordinates",
        "status": "active"
      }
    ]
  }
}
```

##### Station Information
```typescript
// GET /api/v1/stations
// Returns: List of available monitoring stations
{
  "stations": [
    {
      "id": "BABAI_001",
      "name": "Babai at Chepang",
      "location": "coordinates",
      "river": "Babai",
      "status": "active"
    }
  ]
}
```

### Data Processing

#### Water Level Monitoring
```typescript
// Trigger criteria check
async criteriaCheck(payload: AddTriggerStatement) {
  const recentData = await this.prisma.sourcesData.findFirst({
    where: {
      location: payload.location,
      source: 'DHM',
    },
    orderBy: { createdAt: 'desc' }
  });

  const currentLevel = recentData.data.waterLevel;
  const threshold = payload.triggerStatement?.waterLevel;
  
  return this.compareWaterLevels(currentLevel, threshold);
}
```

#### Threshold Comparison Logic
```typescript
compareWaterLevels(currentLevel: number, threshold: number): boolean {
  // Trigger when water level exceeds threshold
  return currentLevel >= threshold;
}
```

### Use Cases

#### 1. Flood Early Warning
- **Trigger Condition**: Water level > 3.5 meters
- **Response**: Immediate beneficiary notification
- **Lead Time**: 2-6 hours depending on river flow

#### 2. River Monitoring
- **Continuous Monitoring**: 24/7 water level tracking
- **Data Storage**: Historical data for trend analysis
- **Alert System**: Automated notifications for threshold breaches

### Data Storage Schema
```sql
-- sources_data table
CREATE TABLE sources_data (
  id SERIAL PRIMARY KEY,
  location VARCHAR(255),
  source VARCHAR(50), -- 'DHM'
  data JSONB, -- Contains water level, timestamp, station info
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 2. Global Flood Awareness System (GLOFAS)

### Purpose
GLOFAS provides global flood forecasting data with probability assessments and lead time analysis. This service enables advanced flood prediction with longer lead times than local monitoring.

### API Integration

#### Base Configuration
```typescript
// Configuration in settings
DATASOURCE: {
  GLOFAS: {
    location: 'Babai at Chepang',
    url: "https://ows.globalfloods.eu/glofas-ows/ows.py",
    bbox: "9066450.71499904,3117815.425733483,9405627.288509797,3456991.999244238",
    i: "89", // coordinate for station
    j: "409"
  }
}
```

#### Data Synchronization
- **Frequency**: Every hour
- **Method**: Automated cron job (`@Cron('0 * * * *')`)
- **Process**: Fetches forecast data and stores with date tracking


## Integration with Trigger System

### Multi-Source Trigger Logic
```typescript
// Combined trigger assessment
async assessTriggerConditions(location: string, triggerConfig: TriggerConfig) {
  const dhmData = await this.getDHMData(location);
  const glofasData = await this.getGLOFASData(location);
  
  // DHM immediate trigger
  const dhmTriggered = this.checkDHMThreshold(dhmData, triggerConfig.dhmThreshold);
  
  // GLOFAS probability trigger
  const glofasTriggered = this.checkGLOFASProbability(glofasData, triggerConfig.probabilityThreshold);
  
  return {
    immediateTrigger: dhmTriggered,
    forecastTrigger: glofasTriggered,
    combinedRisk: this.calculateCombinedRisk(dhmData, glofasData)
  };
}
```

### Trigger Priority System
1. **Immediate Triggers**: DHM water level thresholds
2. **Forecast Triggers**: GLOFAS probability assessments
3. **Combined Triggers**: Both sources indicating high risk

## Data Quality and Reliability

### DHM Data Quality
- **Accuracy**: ±0.1 meter water level precision
- **Availability**: 99.5% uptime
- **Latency**: 5-minute data refresh
- **Coverage**: 15 major river stations in Nepal

### GLOFAS Data Quality
- **Accuracy**: 85-90% forecast accuracy
- **Availability**: 99.9% uptime
- **Latency**: 1-hour forecast updates
- **Coverage**: Global coverage with regional focus


## Monitoring and Alerting

### Data Source Health Monitoring
- **Uptime Monitoring**: Track API availability
- **Data Quality Checks**: Validate received data format
- **Latency Monitoring**: Track response times
- **Error Rate Tracking**: Monitor failed requests

### Alert Thresholds
- **DHM**: Alert if no data for > 15 minutes
- **GLOFAS**: Alert if no data for > 2 hours
- **Data Quality**: Alert if data format is invalid
- **Trigger Failures**: Alert if trigger processing fails

## Future Enhancements

### Planned Integrations
1. **Satellite Data**: Integration with satellite-based flood monitoring
2. **Machine Learning**: Enhanced prediction models
3. **Additional Sources**: Integration with regional meteorological services
4. **Real-time Processing**: Stream processing for immediate analysis

### Scalability Considerations
- **Data Volume**: Handle increasing data from multiple sources
- **Processing Speed**: Optimize for real-time trigger assessment
- **Storage**: Efficient storage of historical data
- **Reliability**: Redundant data sources for critical regions 