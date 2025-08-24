import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';


export class SilscoInfaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sm = new secretsmanager.Secret(this, 'Secret', {
      secretName: "apikey",
      description: "This is my OMDB apikey"

    })

    const tmdbSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 
      'TmdbSecretRef',
      'TmdbSecret'
    );

    const movieSearchLambda = new lambda.Function(this, 'MovieSearchLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
      handler: 'movieSearch.handler',
      environment: {
        TMDB_SECRET_NAME: tmdbSecret.secretName
      },
      timeout: cdk.Duration.seconds(10)
    });

    tmdbSecret.grantRead(movieSearchLambda);
    
    

    const api = new apigateway.RestApi(this, 'movieSearchApi', {
      restApiName: 'Movie Search',
      description: 'search movies',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS, 
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS, 

      }
    });

    const movieResource = api.root.addResource('movies');
    movieResource.addMethod('GET', new apigateway.LambdaIntegration(movieSearchLambda));

    const databaseTable = new dynamodb.TableV2(this, 'Users', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      tableName: 'Users',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    const reviewsTable = new dynamodb.TableV2(this, 'Reviews',{
      partitionKey: {name: 'reviewId', type:dynamodb.AttributeType.STRING},
      tableName:'Reviews',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const addToWatchLambda = new lambda.Function(this, 'addToWatchLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
      handler: 'addToWatchLambda.handler',
      environment: {
        USERTABLE: databaseTable.tableName
      },
      timeout: cdk.Duration.seconds(10)
    });

    databaseTable.grantReadWriteData(addToWatchLambda);

    const addToWatchResource = api.root.addResource('addToWatch');
    addToWatchResource.addMethod('POST', new apigateway.LambdaIntegration(addToWatchLambda));

    //GETWATCHLISTLAMBDA
    const getWatchlistLambda = new lambda.Function(this, 'getWatchlistLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
      handler: 'getWatchlistLambda.handler',
      environment: {
        USERTABLE: databaseTable.tableName
      },
      timeout: cdk.Duration.seconds(10)
    });
    
    //REMOVEFROMWATCHLISTLAMBDA
    databaseTable.grantReadData(getWatchlistLambda);
    const watchlistResource = api.root.addResource('watchlist');
    watchlistResource.addMethod('GET', new apigateway.LambdaIntegration(getWatchlistLambda));
    
    const removeFromWatchlistLambda = new lambda.Function(this, 'removeFromWatchlistLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
      handler: 'removeFromWatchlist.handler',
      environment: {
        USERTABLE: databaseTable.tableName
      },
      timeout: cdk.Duration.seconds(10),
    });
    
    //POSTREVIEWLAMBDA
    const postReviewLambda = new lambda.Function(this, 'postReviewLambda',{
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
      handler: 'postReviewLambda.handler',
      environment:{
        REVIEWSTABLE: reviewsTable.tableName
      },
      timeout: cdk.Duration.seconds(10)
    });

    //GETREVIEWLAMBDA
    const getReviewsLambda = new lambda.Function(this, 'getReviewsLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
      handler: 'getReviewsLambda.handler',
      environment: {
        REVIEWSTABLE: reviewsTable.tableName
      },
      timeout: cdk.Duration.seconds(10),
    });

  const recsImageFn = new lambda.DockerImageFunction(this, 'RecommendationsImgFn', {
    code: lambda.DockerImageCode.fromImageAsset(
       path.join(__dirname, 'lambda', 'recommendations') ,
       { platform: ecr_assets.Platform.LINUX_AMD64}
    ),
    architecture: lambda.Architecture.X86_64,        
    environment: { USERTABLE: databaseTable.tableName,
      OMDB_SECRET_NAME: sm.secretName,
      TMDB_SECRET_NAME: tmdbSecret.secretName
     },
    timeout: cdk.Duration.seconds(30),
    memorySize: 1024,
});
    sm.grantRead(recsImageFn);
    tmdbSecret.grantRead(recsImageFn);

    reviewsTable.grantReadData(getReviewsLambda);
    reviewsTable.grantReadWriteData(postReviewLambda);
    databaseTable.grantReadWriteData(removeFromWatchlistLambda);
    watchlistResource.addMethod('DELETE', new apigateway.LambdaIntegration(removeFromWatchlistLambda));
    const reviewsResource = api.root.addResource('reviews');
    reviewsResource.addMethod('POST', new apigateway.LambdaIntegration(postReviewLambda));
    reviewsResource.addMethod('GET', new apigateway.LambdaIntegration(getReviewsLambda));
  
    databaseTable.grantReadData(recsImageFn);

    const recommendationsResource = api.root.addResource('recommendations');
    recommendationsResource.addMethod('GET', new apigateway.LambdaIntegration(recsImageFn));


    //Output Valuesss
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
    });

    new cdk.CfnOutput(this, 'WatchlistEndpoint', {
      value: `${api.url}watchlist`,
    });

    new cdk.CfnOutput(this, 'AddToWatchEndpoint', {
      value: `${api.url}addToWatch`,
    });

    new cdk.CfnOutput(this, 'PostReviewEndpoint', {
      value: `${api.url}reviews`,
    });

    new cdk.CfnOutput(this, 'GetReviewEndpoint', {
      value: `${api.url}reviews`,
    });
  }
}
